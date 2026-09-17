/*
# الأساس الإنتاجي — السجلات المالية والنقاط وتقسيم الإصدارات وال flags

ما يضيفه هذا الملف (كل شيء Idempotent ولا يمس بيانات موجودة):

1. points_ledger            — سجل نقاط كامل (قبل/بعد/مصدر/إصدار القواعد)
2. scoring_rule_versions    — إصدارات قواعد النقاط (تغيير القواعد لا يغيّر التاريخ)
3. wallet_transactions      — سجل محفظة كامل مع idempotency_key فريد
4. wallet_apply_transaction — دالة آمنة (SECURITY DEFINER) للمدير العام: تطبيق
                              عملية مالية ذرّياً مع balance_before/balance_after،
                              والعودة بالعملية القديمة إذا تكرر المفتاح (منع التكرار)
5. points_award             — دالة منح نقاط عبر السجل
6. feature_flags            — تشغيل/إيقاف الميزات دون نشر نسخة جديدة
7. system_settings + setting_versions — إعدادات النظام مع سجل كل تغيير
8. match_events             — سجل أحداث المباراة (هدف/بطاقة/... ) لإعادة بناء الحالة
9. أعمدة الحذف الناعم على profiles + عمود correlation_id لسجل التدقيق

التنفيذ: شغّل الملف كاملاً في محرر SQL داخل Supabase.
RLS مفعّل على كل جدول جديد: المستخدم يقرأ سجلاته فقط، والمدير العام يرى الكل،
والكتابة تتم فقط عبر الدوال الآمنة.
*/

-- ============ 1) إصدارات قواعد النقاط ============
CREATE TABLE IF NOT EXISTS public.scoring_rule_versions (
  version integer PRIMARY KEY,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.scoring_rule_versions (version, rules)
SELECT 1, '{"prediction_correct": 10, "prediction_exact": 25, "challenge_answer": 5, "fantasy_player": 1, "captain_bonus": 2, "streak_bonus": 5, "referral": 100, "manual_adjustment": 0}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.scoring_rule_versions WHERE version = 1);

-- ============ 2) سجل النقاط ============
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points_before integer NOT NULL DEFAULT 0,
  points_delta integer NOT NULL,
  points_after integer NOT NULL,
  source_type text NOT NULL,
  source_id text,
  rule_version integer NOT NULL DEFAULT 1 REFERENCES public.scoring_rule_versions(version),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS points_ledger_user_created_idx
  ON public.points_ledger (user_id, created_at DESC);

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "points_ledger_read_own" ON public.points_ledger;
CREATE POLICY "points_ledger_read_own" ON public.points_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "points_ledger_read_admin" ON public.points_ledger;
CREATE POLICY "points_ledger_read_admin" ON public.points_ledger
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));

CREATE OR REPLACE FUNCTION public.points_award(
  p_user_id uuid,
  p_delta integer,
  p_source_type text,
  p_source_id text DEFAULT NULL,
  p_rule_version integer DEFAULT 1
) RETURNS public.points_ledger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current integer;
  v_entry public.points_ledger;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT user_points INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  UPDATE public.profiles
  SET user_points = user_points + p_delta
  WHERE id = p_user_id
  RETURNING user_points INTO v_current;

  INSERT INTO public.points_ledger (user_id, points_before, points_delta, points_after, source_type, source_id, rule_version)
  VALUES (p_user_id, v_current - p_delta, p_delta, v_current, p_source_type, p_source_id, p_rule_version)
  RETURNING * INTO v_entry;

  RETURN v_entry;
END $$;

-- ============ 3) سجل المحفظة + Idempotency ============
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('deposit', 'withdraw', 'reward', 'redemption', 'transfer', 'adjustment')),
  amount integer NOT NULL CHECK (amount <> 0),
  balance_before integer NOT NULL,
  balance_after integer NOT NULL,
  source_type text NOT NULL,
  source_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_user_created_idx
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wallet_transactions_source_idx
  ON public.wallet_transactions (source_type, source_id);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_transactions_read_own" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_read_own" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "wallet_transactions_read_admin" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_read_admin" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));

-- لا سياسة INSERT/UPDATE/DELETE للعملاء: الكتابة عبر الدالة الآمنة فقط

CREATE OR REPLACE FUNCTION public.wallet_apply_transaction(
  p_user_id uuid,
  p_type text,
  p_amount integer,
  p_source_type text,
  p_source_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance integer;
  v_existing public.wallet_transactions;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Idempotency: الضغط مرتين لا يضيف مرتين
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing.id IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT bamba_balance INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  IF v_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE public.profiles
  SET bamba_balance = bamba_balance + p_amount
  WHERE id = p_user_id
  RETURNING bamba_balance INTO v_balance;

  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_before, balance_after, source_type, source_id, created_by, idempotency_key, metadata)
  VALUES (p_user_id, p_type, p_amount, v_balance - p_amount, v_balance, p_source_type, p_source_id, auth.uid(), p_idempotency_key, p_metadata)
  RETURNING * INTO v_existing;

  RETURN v_existing;
END $$;

-- ============ 4) Feature Flags ============
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.feature_flags (key, enabled, description) VALUES
  ('fantasy_enabled', false, 'محرك الفانتازي'),
  ('wallet_enabled', true, 'المحفظة والبمبات'),
  ('store_enabled', true, 'المتجر والجوائز'),
  ('challenges_enabled', true, 'التحديات والأسئلة'),
  ('referrals_enabled', true, 'الدعوات والإحالات'),
  ('maintenance_mode', false, 'وضع الصيانة'),
  ('new_prediction_ui', false, 'واجهة التوقعات الجديدة')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_read_all" ON public.feature_flags;
CREATE POLICY "feature_flags_read_all" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feature_flags_write_admin" ON public.feature_flags;
CREATE POLICY "feature_flags_write_admin" ON public.feature_flags
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));

-- ============ 5) إعدادات النظام + سجل التغييرات ============
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.setting_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value) VALUES
  ('challenge_timer_seconds', '45'::jsonb),
  ('prediction_close_minutes_before', '30'::jsonb),
  ('signup_bonus_bamba', '1320'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setting_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_read_admin" ON public.system_settings;
CREATE POLICY "system_settings_read_admin" ON public.system_settings
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));

DROP POLICY IF EXISTS "setting_versions_read_admin" ON public.setting_versions;
CREATE POLICY "setting_versions_read_admin" ON public.setting_versions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));

-- ============ 6) أحداث المباريات ============
CREATE TABLE IF NOT EXISTS public.match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('kickoff', 'goal', 'own_goal', 'yellow_card', 'red_card', 'substitution', 'penalty', 'var', 'halftime', 'fulltime')),
  minute integer,
  team text,
  player_name text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_events_match_idx
  ON public.match_events (match_id, minute);

ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_events_read_auth" ON public.match_events;
CREATE POLICY "match_events_read_auth" ON public.match_events
  FOR SELECT TO authenticated USING (true);

-- ============ 7) الحذف الناعم + ارتباط سجل التدقيق ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deletion_reason text;

ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS correlation_id text;

CREATE INDEX IF NOT EXISTS admin_audit_logs_correlation_idx
  ON public.admin_audit_logs (correlation_id);
