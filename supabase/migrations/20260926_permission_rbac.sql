-- ============================================================================
-- 20260926_permission_rbac.sql
-- ترقية RBAC من «وحدات» إلى «صلاحيات» على مستوى العملية:
-- permissions + roles + role_permissions + admin_users + admin_user_roles
-- + role_scopes + admin_sessions + admin_login_events + approval_requests
-- + audit_logs كامل + feature_flags + maintenance_windows + backup_jobs
--
-- المبادئ المطبقة من وثيقة التصميم:
--   * الصلاحية على مستوى العملية (matches.correct_result) لا على مستوى القسم.
--   * الموظف → الدور → الصلاحية → النطاق → Approval عند الحاجة → تنفيذ → Audit.
--   * Maker → Checker: لا يمكن لمنشئ الطلب الحساس اعتماده بنفسه.
--   * Soft Delete (deleted_at / status = disabled) بدل الحذف الفعلي.
--   * لا صلاحية audit.delete / audit.update أبدًا.
--   * لا تُخزن كلمة مرور أصلية — password_hash فقط.
--   * لا تُخزن Session Token أصلي — session_token_hash فقط.
--   * لوحة الإدارة طبقة مستقلة مرتبطة ببيانات التطبيق: admin_users يرتبط
--     بprofiles (لا نسخة ثانية من المستخدمين) عبر profile_id.
--   * توافق خلفي: has_admin_module() و is_admin_role() تبقى تعمل كما هي،
--     والمسار الجديد للصلاحيات يُضاف فوقها — لا تنكسر الشاشات الحالية.
-- ============================================================================

-- ============ 0) دوال عامة مساعدة ============

-- هل المستخدم الحالي من فريق الإدارة (أي دور إداري قديم أو سجل admin_users جديد)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or exists (select 1 from public.admin_roles ar where ar.role = p.role)
        or exists (select 1 from public.admin_users au where au.profile_id = p.id and au.status = 'active')
      )
  );
$$;

-- ============ 1) permissions — جدول الصلاحيات ============
create table if not exists public.permissions (
  key text primary key,
  module text not null,
  action text not null,
  label_ar text not null,
  sensitive boolean not null default false,
  is_write boolean not null default false,
  created_at timestamptz not null default now(),
  unique (module, action)
);

create index if not exists permissions_module_idx on public.permissions (module);
create index if not exists permissions_sensitive_idx on public.permissions (sensitive) where sensitive;

alter table public.permissions enable row level security;
drop policy if exists "permissions_read_admin" on public.permissions;
create policy "permissions_read_admin" on public.permissions for select to authenticated using (public.is_admin());
grant select on public.permissions to authenticated;

insert into public.permissions (key, module, action, label_ar, sensitive, is_write) values
  -- 👥 المستخدمون
  ('users.view', 'users', 'view', 'عرض المستخدمين', false, false),
  ('users.search', 'users', 'search', 'البحث في المستخدمين', false, false),
  ('users.update', 'users', 'update', 'تعديل بيانات المستخدم', false, true),
  ('users.suspend', 'users', 'suspend', 'إيقاف حساب', false, true),
  ('users.unsuspend', 'users', 'unsuspend', 'إلغاء إيقاف حساب', false, true),
  ('users.force_logout', 'users', 'force_logout', 'تسجيل خروج قسري', false, true),
  ('users.view_private_data', 'users', 'view_private_data', 'عرض البيانات الخاصة', true, false),
  ('users.export', 'users', 'export', 'تصدير قائمة المستخدمين', false, false),
  -- ⚽ المباريات
  ('matches.view', 'matches', 'view', 'عرض المباريات', false, false),
  ('matches.create', 'matches', 'create', 'إنشاء مباراة', false, true),
  ('matches.update', 'matches', 'update', 'تعديل مباراة', false, true),
  ('matches.cancel', 'matches', 'cancel', 'إلغاء مباراة', true, true),
  ('matches.postpone', 'matches', 'postpone', 'تأجيل مباراة', false, true),
  ('matches.publish', 'matches', 'publish', 'نشر مباراة', false, true),
  ('matches.lock_predictions', 'matches', 'lock_predictions', 'قفل التوقعات', false, true),
  ('matches.reopen_predictions', 'matches', 'reopen_predictions', 'إعادة فتح التوقعات', true, true),
  ('matches.set_result', 'matches', 'set_result', 'اعتماد النتيجة', true, true),
  ('matches.correct_result', 'matches', 'correct_result', 'تصحيح النتيجة', true, true),
  -- 🏆 البطولات
  ('competitions.view', 'competitions', 'view', 'عرض البطولات', false, false),
  ('competitions.create', 'competitions', 'create', 'إنشاء بطولة', false, true),
  ('competitions.update', 'competitions', 'update', 'تعديل بطولة', false, true),
  ('competitions.archive', 'competitions', 'archive', 'أرشفة بطولة', false, true),
  ('competitions.publish', 'competitions', 'publish', 'نشر بطولة', false, true),
  ('competitions.manage_teams', 'competitions', 'manage_teams', 'إدارة فرق البطولة', false, true),
  ('competitions.manage_seasons', 'competitions', 'manage_seasons', 'إدارة مواسم البطولة', false, true),
  -- 🛡️ الفرق
  ('teams.view', 'teams', 'view', 'عرض الفرق', false, false),
  ('teams.create', 'teams', 'create', 'إنشاء فريق', false, true),
  ('teams.update', 'teams', 'update', 'تعديل فريق', false, true),
  ('teams.archive', 'teams', 'archive', 'أرشفة فريق', false, true),
  ('teams.manage_players', 'teams', 'manage_players', 'إدارة لاعبي الفريق', false, true),
  -- 🧑‍⚽ اللاعبون
  ('players.view', 'players', 'view', 'عرض اللاعبين', false, false),
  ('players.create', 'players', 'create', 'إنشاء لاعب', false, true),
  ('players.update', 'players', 'update', 'تعديل لاعب', false, true),
  ('players.archive', 'players', 'archive', 'أرشفة لاعب', false, true),
  ('players.manage_history', 'players', 'manage_history', 'إدارة سجل اللاعب', false, true),
  ('players.update_fantasy_price', 'players', 'update_fantasy_price', 'تعديل السعر الفانتازي', false, true),
  -- 🎯 التوقعات
  ('predictions.view', 'predictions', 'view', 'عرض التوقعات', false, false),
  ('predictions.search', 'predictions', 'search', 'البحث في التوقعات', false, false),
  ('predictions.export', 'predictions', 'export', 'تصدير التوقعات', false, false),
  ('predictions.review', 'predictions', 'review', 'مراجعة التوقعات', false, true),
  ('predictions.correct', 'predictions', 'correct', 'تصحيح توقع', true, true),
  ('predictions.invalidate', 'predictions', 'invalidate', 'إبطال توقع', true, true),
  -- 🧮 النقاط
  ('points.view', 'points', 'view', 'عرض النقاط', false, false),
  ('points.rules_view', 'points', 'rules_view', 'عرض قواعد النقاط', false, false),
  ('points.rules_update', 'points', 'rules_update', 'تعديل قواعد النقاط', false, true),
  ('points.recalculate', 'points', 'recalculate', 'إعادة احتساب النقاط', true, true),
  ('points.adjust', 'points', 'adjust', 'تعديل نقاط يدوي', true, true),
  ('points.freeze', 'points', 'freeze', 'تجميد النقاط', false, true),
  ('points.unfreeze', 'points', 'unfreeze', 'إلغاء تجميد النقاط', false, true),
  ('points.export', 'points', 'export', 'تصدير النقاط', false, false),
  -- 🪙 البمبات (المحفظة)
  ('wallets.view', 'wallets', 'view', 'عرض المحافظ', false, false),
  ('wallets.view_transactions', 'wallets', 'view_transactions', 'عرض حركات المحفظة', false, false),
  ('wallets.export', 'wallets', 'export', 'تصدير حركات المحفظة', false, false),
  ('wallets.adjust', 'wallets', 'adjust', 'تعديل رصيد بمبا يدوي', true, true),
  ('wallets.freeze', 'wallets', 'freeze', 'تجميد محفظة', false, true),
  ('wallets.unfreeze', 'wallets', 'unfreeze', 'إلغاء تجميد محفظة', false, true),
  ('wallets.review_suspicious', 'wallets', 'review_suspicious', 'مراجعة حركات مشبوهة', false, true),
  -- 💳 المدفوعات
  ('payments.view', 'payments', 'view', 'عرض المدفوعات', false, false),
  ('payments.review', 'payments', 'review', 'مراجعة دفعة', false, true),
  ('payments.approve', 'payments', 'approve', 'اعتماد دفعة', true, true),
  ('payments.reject', 'payments', 'reject', 'رفض دفعة', false, true),
  ('payments.refund', 'payments', 'refund', 'استرداد مبلغ', true, true),
  ('payments.export', 'payments', 'export', 'تصدير المدفوعات', false, false),
  ('payments.view_sensitive', 'payments', 'view_sensitive', 'عرض بيانات دفع حساسة', true, false),
  -- 🔥 التحديات
  ('challenges.view', 'challenges', 'view', 'عرض التحديات', false, false),
  ('challenges.create', 'challenges', 'create', 'إنشاء تحدي', false, true),
  ('challenges.update', 'challenges', 'update', 'تعديل تحدي', false, true),
  ('challenges.publish', 'challenges', 'publish', 'نشر تحدي', false, true),
  ('challenges.pause', 'challenges', 'pause', 'إيقاف تحدي مؤقتًا', false, true),
  ('challenges.end', 'challenges', 'end', 'إنهاء تحدي', false, true),
  ('challenges.manage_members', 'challenges', 'manage_members', 'إدارة أعضاء تحدي', false, true),
  ('challenges.manage_rewards', 'challenges', 'manage_rewards', 'إدارة جوائز تحدي', false, true),
  -- 🏟️ الحلبات
  ('arenas.view', 'arenas', 'view', 'عرض الحلبات', false, false),
  ('arenas.create', 'arenas', 'create', 'إنشاء حلبة', false, true),
  ('arenas.update', 'arenas', 'update', 'تعديل حلبة', false, true),
  ('arenas.pause', 'arenas', 'pause', 'إيقاف حلبة مؤقتًا', false, true),
  ('arenas.end', 'arenas', 'end', 'إنهاء حلبة', false, true),
  ('arenas.manage_members', 'arenas', 'manage_members', 'إدارة أعضاء حلبة', false, true),
  ('arenas.manage_rewards', 'arenas', 'manage_rewards', 'إدارة جوائز حلبة', false, true),
  ('arenas.review_results', 'arenas', 'review_results', 'مراجعة نتائج حلبة', true, true),
  -- 👔 الفانتازي (أنت المدرب)
  ('fantasy.view', 'fantasy', 'view', 'عرض الفانتازي', false, false),
  ('fantasy.manage_seasons', 'fantasy', 'manage_seasons', 'إدارة مواسم الفانتازي', false, true),
  ('fantasy.manage_players', 'fantasy', 'manage_players', 'إدارة لاعبي الفانتازي', false, true),
  ('fantasy.manage_prices', 'fantasy', 'manage_prices', 'إدارة أسعار اللاعبين', false, true),
  ('fantasy.manage_budget', 'fantasy', 'manage_budget', 'إدارة ميزانية الفانتازي', false, true),
  ('fantasy.manage_rules', 'fantasy', 'manage_rules', 'إدارة قواعد الفانتازي', false, true),
  ('fantasy.recalculate_points', 'fantasy', 'recalculate_points', 'إعادة احتساب نقاط الفانتازي', true, true),
  ('fantasy.review_transfers', 'fantasy', 'review_transfers', 'مراجعة انتقالات اللاعبين', false, true),
  ('fantasy.export', 'fantasy', 'export', 'تصدير بيانات الفانتازي', false, false),
  -- 🧠 بنك الأسئلة (Quiz)
  ('quiz.view', 'quiz', 'view', 'عرض الأسئلة', false, false),
  ('quiz.create', 'quiz', 'create', 'إنشاء سؤال', false, true),
  ('quiz.update', 'quiz', 'update', 'تعديل سؤال', false, true),
  ('quiz.delete', 'quiz', 'delete', 'حذف سؤال', false, true),
  ('quiz.publish', 'quiz', 'publish', 'نشر سؤال', false, true),
  ('quiz.unpublish', 'quiz', 'unpublish', 'إلغاء نشر سؤال', false, true),
  ('quiz.manage_answers', 'quiz', 'manage_answers', 'إدارة الإجابات الصحيحة', false, true),
  ('quiz.manage_rewards', 'quiz', 'manage_rewards', 'إدارة مكافآت الأسئلة', false, true),
  -- 🛍️ المتجر
  ('store.view', 'store', 'view', 'عرض المتجر', false, false),
  ('store.create_product', 'store', 'create_product', 'إنشاء منتج', false, true),
  ('store.update_product', 'store', 'update_product', 'تعديل منتج', false, true),
  ('store.archive_product', 'store', 'archive_product', 'أرشفة منتج', false, true),
  ('store.manage_inventory', 'store', 'manage_inventory', 'إدارة المخزون', false, true),
  ('store.manage_orders', 'store', 'manage_orders', 'إدارة الطلبات', false, true),
  ('store.cancel_order', 'store', 'cancel_order', 'إلغاء طلب', false, true),
  -- 🎁 الجوائز
  ('prizes.view', 'prizes', 'view', 'عرض الجوائز', false, false),
  ('prizes.create', 'prizes', 'create', 'إنشاء جائزة', false, true),
  ('prizes.update', 'prizes', 'update', 'تعديل جائزة', false, true),
  ('prizes.archive', 'prizes', 'archive', 'أرشفة جائزة', false, true),
  ('prizes.approve_redemption', 'prizes', 'approve_redemption', 'اعتماد استرداد جائزة', true, true),
  ('prizes.reject_redemption', 'prizes', 'reject_redemption', 'رفض استرداد جائزة', false, true),
  ('prizes.mark_ready', 'prizes', 'mark_ready', 'تحديد الجائزة جاهزة', false, true),
  ('prizes.mark_delivered', 'prizes', 'mark_delivered', 'تحديد الجائزة سُلّمت', false, true),
  -- 🤝 الشركاء
  ('partners.view', 'partners', 'view', 'عرض الشركاء', false, false),
  ('partners.create', 'partners', 'create', 'إنشاء شريك', false, true),
  ('partners.update', 'partners', 'update', 'تعديل شريك', false, true),
  ('partners.archive', 'partners', 'archive', 'أرشفة شريك', false, true),
  ('partners.publish', 'partners', 'publish', 'نشر شريك', false, true),
  ('partners.manage_offers', 'partners', 'manage_offers', 'إدارة عروض الشريك', false, true),
  -- 🎟️ الكوبونات
  ('coupons.view', 'coupons', 'view', 'عرض الكوبونات', false, false),
  ('coupons.create', 'coupons', 'create', 'إنشاء كوبون', false, true),
  ('coupons.update', 'coupons', 'update', 'تعديل كوبون', false, true),
  ('coupons.disable', 'coupons', 'disable', 'تعطيل كوبون', false, true),
  ('coupons.export', 'coupons', 'export', 'تصدير الكوبونات', false, false),
  ('coupons.review_redemptions', 'coupons', 'review_redemptions', 'مراجعة استرداد الكوبونات', false, true),
  -- 🔔 الإشعارات
  ('notifications.view', 'notifications', 'view', 'عرض الإشعارات', false, false),
  ('notifications.create', 'notifications', 'create', 'إنشاء إشعار', false, true),
  ('notifications.schedule', 'notifications', 'schedule', 'جدولة إشعار', false, true),
  ('notifications.send', 'notifications', 'send', 'إرسال إشعار جماعي', true, true),
  ('notifications.cancel', 'notifications', 'cancel', 'إلغاء إشعار', false, true),
  ('notifications.view_history', 'notifications', 'view_history', 'عرض سجل الإشعارات', false, false),
  -- 📝 CMS
  ('cms.view', 'cms', 'view', 'عرض المحتوى', false, false),
  ('cms.create', 'cms', 'create', 'إنشاء محتوى', false, true),
  ('cms.update', 'cms', 'update', 'تعديل محتوى', false, true),
  ('cms.publish', 'cms', 'publish', 'نشر محتوى', false, true),
  ('cms.unpublish', 'cms', 'unpublish', 'إلغاء نشر محتوى', false, true),
  ('cms.archive', 'cms', 'archive', 'أرشفة محتوى', false, true),
  -- 🎧 الدعم
  ('support.view', 'support', 'view', 'عرض تذاكر الدعم', false, false),
  ('support.assign', 'support', 'assign', 'إسناد تذكرة', false, true),
  ('support.reply', 'support', 'reply', 'الرد على تذكرة', false, true),
  ('support.close', 'support', 'close', 'إغلاق تذكرة', false, true),
  ('support.reopen', 'support', 'reopen', 'إعادة فتح تذكرة', false, true),
  ('support.export', 'support', 'export', 'تصدير التذاكر', false, false),
  ('support.view_sensitive', 'support', 'view_sensitive', 'عرض بيانات دعم حساسة', true, false),
  -- 📊 التقارير
  ('reports.view', 'reports', 'view', 'عرض التقارير', false, false),
  ('reports.export', 'reports', 'export', 'تصدير التقارير', false, false),
  ('reports.financial', 'reports', 'financial', 'تقارير مالية', true, false),
  ('reports.users', 'reports', 'users', 'تقارير المستخدمين', false, false),
  ('reports.predictions', 'reports', 'predictions', 'تقارير التوقعات', false, false),
  ('reports.wallet', 'reports', 'wallet', 'تقارير المحفظة', false, false),
  ('reports.challenges', 'reports', 'challenges', 'تقارير التحديات', false, false),
  ('reports.support', 'reports', 'support', 'تقارير الدعم', false, false),
  -- ⚙️ إعدادات النظام
  ('settings.view', 'settings', 'view', 'عرض الإعدادات', false, false),
  ('settings.update', 'settings', 'update', 'تعديل الإعدادات', false, true),
  ('settings.manage_feature_flags', 'settings', 'manage_feature_flags', 'إدارة مبدلات الميزات', false, true),
  ('settings.manage_integrations', 'settings', 'manage_integrations', 'إدارة التكاملات (API Keys)', true, true),
  -- 🔧 الصيانة
  ('maintenance.view', 'maintenance', 'view', 'عرض نوافذ الصيانة', false, false),
  ('maintenance.create', 'maintenance', 'create', 'إنشاء نافذة صيانة', false, true),
  ('maintenance.update', 'maintenance', 'update', 'تعديل نافذة صيانة', false, true),
  ('maintenance.activate', 'maintenance', 'activate', 'تفعيل وضع الصيانة', true, true),
  ('maintenance.deactivate', 'maintenance', 'deactivate', 'إلغاء وضع الصيانة', true, true),
  -- 📲 إصدارات التطبيق
  ('app_versions.view', 'app_versions', 'view', 'عرض الإصدارات', false, false),
  ('app_versions.create', 'app_versions', 'create', 'إضافة إصدار', false, true),
  ('app_versions.update', 'app_versions', 'update', 'تعديل إصدار', false, true),
  ('app_versions.force_update', 'app_versions', 'force_update', 'فرض تحديث إجباري', true, true),
  -- 🔐 الأمان
  ('security.view_events', 'security', 'view_events', 'عرض أحداث تسجيل الدخول', false, false),
  ('security.view_admin_sessions', 'security', 'view_admin_sessions', 'عرض جلسات الإدارة', false, false),
  ('security.revoke_session', 'security', 'revoke_session', 'إلغاء جلسة إدارة', false, true),
  ('security.lock_admin', 'security', 'lock_admin', 'قفل حساب إداري', true, true),
  ('security.unlock_admin', 'security', 'unlock_admin', 'فتح حساب إداري', false, true),
  ('security.manage_2fa', 'security', 'manage_2fa', 'إدارة المصادقة الثنائية', true, true),
  -- 📜 سجل التدقيق (قراءة فقط — لا delete ولا update إطلاقًا)
  ('audit.view', 'audit', 'view', 'عرض سجل التدقيق', false, false),
  ('audit.export', 'audit', 'export', 'تصدير سجل التدقيق', false, false)
on conflict (key) do update set
  module = excluded.module,
  action = excluded.action,
  label_ar = excluded.label_ar,
  sensitive = excluded.sensitive,
  is_write = excluded.is_write;

-- ============ 2) roles — الأدوار الوظيفية ============
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name_ar text not null,
  display_name_en text,
  description text,
  is_system_role boolean not null default true,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roles enable row level security;
drop policy if exists "roles_read_admin" on public.roles;
create policy "roles_read_admin" on public.roles for select to authenticated using (public.is_admin());
grant select on public.roles to authenticated;

insert into public.roles (name, display_name_ar, display_name_en, description) values
  ('super_admin', 'مدير عام', 'Super Admin', 'كل الصلاحيات — الحذف الفعلي للبيانات الحرجة غير مسموح كإجراء عادي.'),
  ('admin', 'مشرف', 'Admin', 'لوحة محصورة: لوحة التحكم + المباريات + المتجر.'),
  ('competition_manager', 'مدير المسابقات', 'Competition Manager', 'إدارة المباريات والبطولات والفرق رياضياً.'),
  ('prediction_manager', 'مدير التوقعات', 'Prediction Manager', 'إدارة التوقعات والنقاط والتصحيحات الموثقة.'),
  ('challenge_manager', 'مدير التحديات', 'Challenge Manager', 'الحلبات وأنت المدرب وبنك الأسئلة والتحديات.'),
  ('finance_manager', 'مدير المالية', 'Finance Manager', 'المحافظ والمدفوعات والاستردادات والتقارير المالية.'),
  ('wallet_manager', 'مدير المحفظة', 'Wallet Manager', 'إدارة المحافظ وحركاتها (تكافؤ مالي مع مدير المالية).'),
  ('store_manager', 'مدير المتجر', 'Store Manager', 'المنتجات والمخزون والطلبات والجوائز والكوبونات.'),
  ('partner_manager', 'مدير الشركاء', 'Partner Manager', 'الشركاء والعروض والكوبونات المرتبطة.'),
  ('support_agent', 'موظف الدعم', 'Support Agent', 'تذاكر الدعم وعرض محدود لحسابات الأعضاء.'),
  ('content_manager', 'مدير المحتوى', 'Content Manager', 'CMS والإشعارات والإصدارات ونوافذ الصيانة.'),
  ('analyst', 'محلل', 'Analyst', 'قراءة فقط (دون تعديل أي بيانات تشغيلية) + التقارير.')
on conflict (name) do update set
  display_name_ar = excluded.display_name_ar,
  display_name_en = excluded.display_name_en,
  description = excluded.description;

-- ============ 3) role_permissions — مصفوفة الدور → الصلاحيات ============
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index if not exists role_permissions_perm_idx on public.role_permissions (permission_id);

alter table public.role_permissions enable row level security;
drop policy if exists "role_permissions_read_admin" on public.role_permissions;
create policy "role_permissions_read_admin" on public.role_permissions for select to authenticated using (public.is_admin());
grant select on public.role_permissions to authenticated;

-- ملء المصفوفة حسب وثيقة التصميم (الأقسام 40-49)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (values
  -- 👑 super_admin: كل الصلاحيات (يُملأ أدناه)
  -- 🛅 admin (مشرف): لوحة التحكم + المباريات + المتجر
  ('admin', 'matches.view'), ('admin', 'matches.create'), ('admin', 'matches.update'),
  ('admin', 'matches.postpone'), ('admin', 'matches.publish'), ('admin', 'matches.lock_predictions'),
  ('admin', 'matches.set_result'),
  ('admin', 'store.view'), ('admin', 'store.create_product'), ('admin', 'store.update_product'),
  ('admin', 'store.archive_product'), ('admin', 'store.manage_inventory'), ('admin', 'store.manage_orders'),
  ('admin', 'store.cancel_order'),
  ('admin', 'prizes.view'), ('admin', 'coupons.view'),
  -- ⚽ competition_manager
  ('competition_manager', 'matches.view'), ('competition_manager', 'matches.create'),
  ('competition_manager', 'matches.update'), ('competition_manager', 'matches.cancel'),
  ('competition_manager', 'matches.postpone'), ('competition_manager', 'matches.publish'),
  ('competition_manager', 'matches.lock_predictions'), ('competition_manager', 'matches.reopen_predictions'),
  ('competition_manager', 'matches.set_result'), ('competition_manager', 'matches.correct_result'),
  ('competition_manager', 'competitions.view'), ('competition_manager', 'competitions.create'),
  ('competition_manager', 'competitions.update'), ('competition_manager', 'competitions.archive'),
  ('competition_manager', 'competitions.publish'), ('competition_manager', 'competitions.manage_teams'),
  ('competition_manager', 'competitions.manage_seasons'),
  ('competition_manager', 'teams.view'), ('competition_manager', 'teams.create'),
  ('competition_manager', 'teams.update'), ('competition_manager', 'teams.archive'),
  ('competition_manager', 'teams.manage_players'),
  ('competition_manager', 'players.view'), ('competition_manager', 'players.update'),
  ('competition_manager', 'predictions.view'), ('competition_manager', 'points.view'),
  ('competition_manager', 'points.rules_view'),
  ('competition_manager', 'reports.view'), ('competition_manager', 'reports.export'),
  -- 🎯 prediction_manager
  ('prediction_manager', 'matches.view'),
  ('prediction_manager', 'predictions.view'), ('prediction_manager', 'predictions.search'),
  ('prediction_manager', 'predictions.export'), ('prediction_manager', 'predictions.review'),
  ('prediction_manager', 'predictions.correct'), ('prediction_manager', 'predictions.invalidate'),
  ('prediction_manager', 'points.view'), ('prediction_manager', 'points.rules_view'),
  ('prediction_manager', 'points.rules_update'), ('prediction_manager', 'points.recalculate'),
  ('prediction_manager', 'points.adjust'), ('prediction_manager', 'points.freeze'),
  ('prediction_manager', 'points.unfreeze'), ('prediction_manager', 'points.export'),
  ('prediction_manager', 'competitions.view'), ('prediction_manager', 'teams.view'),
  ('prediction_manager', 'players.view'),
  ('prediction_manager', 'reports.view'), ('prediction_manager', 'reports.export'),
  ('prediction_manager', 'reports.predictions'),
  -- 🔥 challenge_manager
  ('challenge_manager', 'arenas.view'), ('challenge_manager', 'arenas.create'),
  ('challenge_manager', 'arenas.update'), ('challenge_manager', 'arenas.pause'),
  ('challenge_manager', 'arenas.end'), ('challenge_manager', 'arenas.manage_members'),
  ('challenge_manager', 'arenas.manage_rewards'), ('challenge_manager', 'arenas.review_results'),
  ('challenge_manager', 'challenges.view'), ('challenge_manager', 'challenges.create'),
  ('challenge_manager', 'challenges.update'), ('challenge_manager', 'challenges.publish'),
  ('challenge_manager', 'challenges.pause'), ('challenge_manager', 'challenges.end'),
  ('challenge_manager', 'challenges.manage_members'), ('challenge_manager', 'challenges.manage_rewards'),
  ('challenge_manager', 'quiz.view'), ('challenge_manager', 'quiz.create'),
  ('challenge_manager', 'quiz.update'), ('challenge_manager', 'quiz.delete'),
  ('challenge_manager', 'quiz.publish'), ('challenge_manager', 'quiz.unpublish'),
  ('challenge_manager', 'quiz.manage_answers'), ('challenge_manager', 'quiz.manage_rewards'),
  ('challenge_manager', 'fantasy.view'), ('challenge_manager', 'fantasy.manage_seasons'),
  ('challenge_manager', 'fantasy.manage_players'), ('challenge_manager', 'fantasy.manage_prices'),
  ('challenge_manager', 'fantasy.manage_budget'), ('challenge_manager', 'fantasy.manage_rules'),
  ('challenge_manager', 'fantasy.recalculate_points'), ('challenge_manager', 'fantasy.review_transfers'),
  ('challenge_manager', 'fantasy.export'),
  ('challenge_manager', 'prizes.view'), ('challenge_manager', 'wallets.view'),
  -- 🪙 finance_manager + wallet_manager
  ('finance_manager', 'wallets.view'), ('finance_manager', 'wallets.view_transactions'),
  ('finance_manager', 'wallets.export'), ('finance_manager', 'wallets.adjust'),
  ('finance_manager', 'wallets.freeze'), ('finance_manager', 'wallets.unfreeze'),
  ('finance_manager', 'wallets.review_suspicious'),
  ('finance_manager', 'payments.view'), ('finance_manager', 'payments.review'),
  ('finance_manager', 'payments.approve'), ('finance_manager', 'payments.reject'),
  ('finance_manager', 'payments.refund'), ('finance_manager', 'payments.export'),
  ('finance_manager', 'payments.view_sensitive'),
  ('finance_manager', 'reports.view'), ('finance_manager', 'reports.export'),
  ('finance_manager', 'reports.financial'), ('finance_manager', 'reports.wallet'),
  ('finance_manager', 'prizes.view'),
  ('wallet_manager', 'wallets.view'), ('wallet_manager', 'wallets.view_transactions'),
  ('wallet_manager', 'wallets.export'), ('wallet_manager', 'wallets.adjust'),
  ('wallet_manager', 'wallets.freeze'), ('wallet_manager', 'wallets.unfreeze'),
  ('wallet_manager', 'wallets.review_suspicious'),
  ('wallet_manager', 'payments.view'), ('wallet_manager', 'payments.review'),
  ('wallet_manager', 'payments.approve'), ('wallet_manager', 'payments.reject'),
  ('wallet_manager', 'payments.refund'), ('wallet_manager', 'payments.export'),
  ('wallet_manager', 'payments.view_sensitive'),
  ('wallet_manager', 'reports.view'), ('wallet_manager', 'reports.export'),
  ('wallet_manager', 'reports.financial'), ('wallet_manager', 'reports.wallet'),
  ('wallet_manager', 'prizes.view'),
  -- 🛍️ store_manager
  ('store_manager', 'store.view'), ('store_manager', 'store.create_product'),
  ('store_manager', 'store.update_product'), ('store_manager', 'store.archive_product'),
  ('store_manager', 'store.manage_inventory'), ('store_manager', 'store.manage_orders'),
  ('store_manager', 'store.cancel_order'),
  ('store_manager', 'prizes.view'), ('store_manager', 'prizes.create'),
  ('store_manager', 'prizes.update'), ('store_manager', 'prizes.archive'),
  ('store_manager', 'prizes.approve_redemption'), ('store_manager', 'prizes.reject_redemption'),
  ('store_manager', 'prizes.mark_ready'), ('store_manager', 'prizes.mark_delivered'),
  ('store_manager', 'coupons.view'), ('store_manager', 'coupons.create'),
  ('store_manager', 'coupons.update'), ('store_manager', 'coupons.disable'),
  ('store_manager', 'coupons.export'), ('store_manager', 'coupons.review_redemptions'),
  ('store_manager', 'partners.view'),
  -- 🤝 partner_manager
  ('partner_manager', 'partners.view'), ('partner_manager', 'partners.create'),
  ('partner_manager', 'partners.update'), ('partner_manager', 'partners.archive'),
  ('partner_manager', 'partners.publish'), ('partner_manager', 'partners.manage_offers'),
  ('partner_manager', 'coupons.view'), ('partner_manager', 'coupons.create'),
  ('partner_manager', 'coupons.update'), ('partner_manager', 'coupons.disable'),
  ('partner_manager', 'reports.view'), ('partner_manager', 'reports.export'),
  -- 🎧 support_agent
  ('support_agent', 'users.view'), ('support_agent', 'users.search'),
  ('support_agent', 'support.view'), ('support_agent', 'support.assign'),
  ('support_agent', 'support.reply'), ('support_agent', 'support.close'),
  ('support_agent', 'support.reopen'), ('support_agent', 'support.export'),
  ('support_agent', 'payments.view'), ('support_agent', 'wallets.view'),
  ('support_agent', 'predictions.view'), ('support_agent', 'coupons.view'),
  -- 📢 content_manager
  ('content_manager', 'cms.view'), ('content_manager', 'cms.create'),
  ('content_manager', 'cms.update'), ('content_manager', 'cms.publish'),
  ('content_manager', 'cms.unpublish'), ('content_manager', 'cms.archive'),
  ('content_manager', 'notifications.view'), ('content_manager', 'notifications.create'),
  ('content_manager', 'notifications.schedule'), ('content_manager', 'notifications.send'),
  ('content_manager', 'notifications.cancel'), ('content_manager', 'notifications.view_history'),
  ('content_manager', 'app_versions.view'), ('content_manager', 'app_versions.create'),
  ('content_manager', 'app_versions.update'), ('content_manager', 'app_versions.force_update'),
  ('content_manager', 'maintenance.view'), ('content_manager', 'maintenance.create'),
  ('content_manager', 'maintenance.update'), ('content_manager', 'reports.view'),
  -- 📊 analyst (قراءة فقط)
  ('analyst', 'users.view'), ('analyst', 'users.search'),
  ('analyst', 'matches.view'), ('analyst', 'competitions.view'),
  ('analyst', 'teams.view'), ('analyst', 'players.view'),
  ('analyst', 'predictions.view'), ('analyst', 'predictions.search'),
  ('analyst', 'points.view'), ('analyst', 'points.rules_view'),
  ('analyst', 'wallets.view'), ('analyst', 'wallets.view_transactions'),
  ('analyst', 'challenges.view'), ('analyst', 'arenas.view'),
  ('analyst', 'fantasy.view'), ('analyst', 'quiz.view'),
  ('analyst', 'store.view'), ('analyst', 'prizes.view'),
  ('analyst', 'partners.view'), ('analyst', 'coupons.view'),
  ('analyst', 'support.view'),
  ('analyst', 'reports.view'), ('analyst', 'reports.export'),
  ('analyst', 'reports.users'), ('analyst', 'reports.predictions'),
  ('analyst', 'reports.wallet'), ('analyst', 'reports.challenges'),
  ('analyst', 'reports.support')
) as t(role_name, perm_key)
join public.roles r on r.name = t.role_name
join public.permissions p on p.key = t.perm_key
on conflict do nothing;

-- 👑 super_admin: كل الصلاحيات الموجودة
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'super_admin'
on conflict do nothing;

-- ============ 4) admin_users — حسابات الموظفين/المديرين ============
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  password_hash text,
  display_name text,
  phone text,
  avatar text,
  status text not null default 'active' check (status in ('active','suspended','locked','pending','disabled')),
  is_super_admin boolean not null default false,
  two_factor_enabled boolean not null default false,
  two_factor_secret text,
  last_login_at timestamptz,
  last_login_ip text,
  password_changed_at timestamptz,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists admin_users_status_idx on public.admin_users (status);
create index if not exists admin_users_profile_idx on public.admin_users (profile_id);

alter table public.admin_users enable row level security;
drop policy if exists "admin_users_read_admin" on public.admin_users;
create policy "admin_users_read_admin" on public.admin_users for select to authenticated using (public.is_admin());
drop policy if exists "admin_users_read_own" on public.admin_users;
create policy "admin_users_read_own" on public.admin_users for select to authenticated using (profile_id = auth.uid());
grant select on public.admin_users to authenticated;

-- زرع سجلات الإدارة من الحسابات الحالية (لا نسخة ثانية من المستخدمين)
insert into public.admin_users (profile_id, username, email, display_name, status, is_super_admin)
select
  p.id,
  coalesce(nullif(split_part(p.email, '@', 1), ''), 'admin_' || left(p.id::text, 8)),
  p.email,
  p.username,
  'active',
  (p.role = 'super_admin')
from public.profiles p
where p.role in (select role from public.admin_roles)
   or p.role = 'super_admin'
on conflict (profile_id) do nothing;

-- ============ 5) admin_user_roles — أدوار متعددة + صلاحيات مؤقتة ============
create table if not exists public.admin_user_roles (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.admin_users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (admin_user_id, role_id)
);

create index if not exists admin_user_roles_active_idx on public.admin_user_roles (admin_user_id) where expires_at is null or expires_at > now();

alter table public.admin_user_roles enable row level security;
drop policy if exists "admin_user_roles_read_admin" on public.admin_user_roles;
create policy "admin_user_roles_read_admin" on public.admin_user_roles for select to authenticated using (public.is_admin());
grant select on public.admin_user_roles to authenticated;

-- ربط سجلات الإدارة بأدوارها الحالية
insert into public.admin_user_roles (admin_user_id, role_id)
select au.id, r.id
from public.admin_users au
join public.profiles p on p.id = au.profile_id
join public.roles r on r.name = p.role
on conflict do nothing;

-- ============ 6) role_scopes — النطاقات (global/competition/country/challenge/department) ============
create table if not exists public.role_scopes (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  scope_type text not null check (scope_type in ('global','competition','country','challenge','department')),
  scope_id text,
  created_at timestamptz not null default now(),
  unique (role_id, scope_type, coalesce(scope_id, ''))
);

alter table public.role_scopes enable row level security;
drop policy if exists "role_scopes_read_admin" on public.role_scopes;
create policy "role_scopes_read_admin" on public.role_scopes for select to authenticated using (public.is_admin());
drop policy if exists "role_scopes_write_super" on public.role_scopes;
create policy "role_scopes_write_super" on public.role_scopes for insert to authenticated with check (
  public.has_permission('security.manage_2fa')
);
grant select, insert on public.role_scopes to authenticated;

-- هل ينطبق نطاق الدور على الكيان المطلوب؟
create or replace function public.check_scope(p_scope_type text, p_scope_id text default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'super_admin')
    or exists (
      select 1
      from public.admin_users au
      join public.admin_user_roles aur on aur.admin_user_id = au.id
        and (aur.expires_at is null or aur.expires_at > now())
      join public.role_scopes rs on rs.role_id = aur.role_id
      where au.profile_id = auth.uid()
        and (rs.scope_type = 'global'
             or (rs.scope_type = p_scope_type
                 and (rs.scope_id is null or rs.scope_id = p_scope_id)))
    );
$$;

-- ============ 7) مدققات الصلاحيات (الجديدة + المتوافقة) ============

-- الصلاحية الدقيقة (المسار الجديد + التخفيض على أدوار الوحدات القديمة)
create or replace function public.has_permission(p_key text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and (
        pr.role = 'super_admin'
        or exists (
          select 1
          from public.admin_users au
          join public.admin_user_roles aur on aur.admin_user_id = au.id
            and (aur.expires_at is null or aur.expires_at > now())
          join public.role_permissions rp on rp.role_id = aur.role_id
          join public.permissions perm on perm.id = rp.permission_id
          where au.profile_id = pr.id
            and au.status = 'active'
            and perm.key = p_key
        )
        or exists (
          select 1
          from public.admin_roles ar
          join public.permissions perm on perm.key = p_key
          where ar.role = pr.role
            and ('*' = any(ar.read_modules) or perm.module = any(ar.read_modules))
        )
      )
  );
$$;

-- has_admin_module: يبقى يعمل عبر المسار الجديد + القديم معًا
create or replace function public.has_admin_module(p_module text, p_write boolean default false)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and (
        pr.role = 'super_admin'
        or exists (
          select 1
          from public.admin_users au
          join public.admin_user_roles aur on aur.admin_user_id = au.id
            and (aur.expires_at is null or aur.expires_at > now())
          join public.role_permissions rp on rp.role_id = aur.role_id
          join public.permissions perm on perm.id = rp.permission_id
          where au.profile_id = pr.id
            and au.status = 'active'
            and perm.module = p_module
            and (not p_write or perm.is_write)
        )
        or exists (
          select 1
          from public.admin_roles ar
          where ar.role = pr.role
            and ('*' = any(case when p_write then ar.write_modules else ar.read_modules end)
                 or p_module = any(case when p_write then ar.write_modules else ar.read_modules end))
        )
      )
  );
$$;

-- قائمة صلاحيات المستخدم الحالي (لللوحة)
create or replace function public.admin_my_permissions()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_role text;
  v_is_super boolean;
  v_perms text[] := '{}'::text[];
  v_roles text[] := '{}'::text[];
  v_read text[] := '{}'::text[];
  v_write text[] := '{}'::text[];
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is null then return null; end if;
  v_is_super := (v_role = 'super_admin');

  -- صلاحيات الأدوار الجديدة
  select coalesce(array_agg(distinct perm.key order by perm.key), '{}'::text[]) into v_perms
  from public.admin_users au
  join public.admin_user_roles aur on aur.admin_user_id = au.id
    and (aur.expires_at is null or aur.expires_at > now())
  join public.role_permissions rp on rp.role_id = aur.role_id
  join public.permissions perm on perm.id = rp.permission_id
  where au.profile_id = auth.uid() and au.status = 'active';

  if v_is_super then
    v_perms := array(select key from public.permissions order by key);
  end if;

  -- أسماء أدوار المستخدم (القديمة والجديدة)
  select coalesce(array_agg(distinct ar.role order by ar.role), '{}'::text[]) into v_roles
  from public.admin_roles ar where ar.role = v_role;

  -- الوحدات المقروءة/القابلة للكتابة المشتقة من الصلاحيات الفعلية
  select coalesce(array_agg(distinct module order by module), '{}'::text[]) into v_read
  from public.permissions where key = any(v_perms);

  select coalesce(array_agg(distinct module order by module), '{}'::text[]) into v_write
  from public.permissions where key = any(v_perms) and is_write;

  return jsonb_build_object(
    'is_super', v_is_super,
    'role', v_role,
    'roles', v_roles,
    'permissions', v_perms,
    'read_modules', v_read,
    'write_modules', v_write
  );
end $$;

revoke all on function public.admin_my_permissions() from public;
grant execute on function public.admin_my_permissions() to authenticated;

-- فحص قائمة أدوار (يبقى متوافقًا)
create or replace function public.is_admin_role(p_roles text[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any(p_roles));
$$;

-- توسيع set_user_role: يقبل أدوار الجدولين admin_roles و roles
create or replace function public.set_user_role(p_target_id uuid, p_new_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_caller_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'super_admin' then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_new_role <> 'user'
     and not exists (select 1 from public.admin_roles where role = p_new_role)
     and not exists (select 1 from public.roles where name = p_new_role) then
    return jsonb_build_object('error', 'INVALID_ROLE');
  end if;
  if p_target_id = auth.uid() then return jsonb_build_object('error', 'SELF_ROLE'); end if;

  update public.profiles set role = p_new_role where id = p_target_id;

  -- مزامنة سجل admin_users مع الدور الجديد
  if p_new_role <> 'user' then
    insert into public.admin_users (profile_id, username, email, display_name, is_super_admin)
    select id, coalesce(nullif(split_part(email, '@', 1), ''), 'admin_' || left(id::text, 8)), email, username, (p_new_role = 'super_admin')
    from public.profiles where id = p_target_id
    on conflict (profile_id) do update set status = 'active', deleted_at = null;
    insert into public.admin_user_roles (admin_user_id, role_id)
    select au.id, r.id
    from public.admin_users au
    join public.roles r on r.name = p_new_role
    where au.profile_id = p_target_id
    on conflict do nothing;
  end if;

  perform public.log_admin_action('set_role', 'profiles', p_target_id::text, 'role -> ' || p_new_role);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- تحرير مصفوفة أدوار (سوبر أدمن فقط) — يبقي قديمًا ويشمل الأدوار الجديدة
create or replace function public.admin_edit_role_matrix(p_role text, p_read text[], p_write text[], p_label_ar text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_caller_role text; v_updated boolean := false;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'super_admin' then return jsonb_build_object('error', 'FORBIDDEN'); end if;

  update public.admin_roles
     set read_modules = coalesce(p_read, read_modules),
         write_modules = coalesce(p_write, write_modules),
         label_ar = coalesce(nullif(trim(coalesce(p_label_ar, '')), ''), label_ar)
   where role = p_role;
  if found then v_updated := true; end if;

  update public.roles
     set display_name_ar = coalesce(nullif(trim(coalesce(p_label_ar, '')), ''), display_name_ar)
   where name = p_role;
  if found then v_updated := true; end if;

  if not v_updated then return jsonb_build_object('error', 'ROLE_NOT_FOUND'); end if;
  perform public.log_admin_action('edit_role_matrix', 'roles', p_role);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_edit_role_matrix(text, text[], text[], text) from public;
grant execute on function public.admin_edit_role_matrix(text, text[], text[], text) to authenticated;

-- إدارة أدوار موظف (تعيين/إزالة/انتهاء) — سوبر أدمن أو security.manage_2fa
create or replace function public.admin_assign_role(
  p_admin_user_id uuid, p_role_name text, p_expires_at timestamptz default null, p_remove boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_role_id uuid;
begin
  select id into v_me from public.admin_users where profile_id = auth.uid();
  if v_me is null
     and not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'super_admin') then
    return jsonb_build_object('error', 'FORBIDDEN');
  end if;
  if not (public.has_permission('security.manage_2fa') or public.has_permission('security.lock_admin')) then
    return jsonb_build_object('error', 'FORBIDDEN');
  end if;

  select id into v_role_id from public.roles where name = p_role_name;
  if v_role_id is null then return jsonb_build_object('error', 'INVALID_ROLE'); end if;

  if p_remove then
    delete from public.admin_user_roles where admin_user_id = p_admin_user_id and role_id = v_role_id;
  else
    insert into public.admin_user_roles (admin_user_id, role_id, assigned_by, expires_at)
    values (p_admin_user_id, v_role_id, v_me, p_expires_at)
    on conflict (admin_user_id, role_id) do update set expires_at = excluded.expires_at, assigned_by = excluded.assigned_by;
  end if;

  perform public.log_admin_action('assign_role', 'admin_user_roles', p_admin_user_id::text, p_role_name);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_assign_role(uuid, text, timestamptz, boolean) from public;
grant execute on function public.admin_assign_role(uuid, text, timestamptz, boolean) to authenticated;

-- ============ 8) admin_sessions + admin_login_events ============
create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  session_token_hash text not null unique,
  ip_address text,
  user_agent text,
  device_name text,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists admin_sessions_owner_idx on public.admin_sessions (admin_user_id);
create index if not exists admin_sessions_revoked_idx on public.admin_sessions (expires_at) where revoked_at is null;

alter table public.admin_sessions enable row level security;
drop policy if exists "admin_sessions_read_admin" on public.admin_sessions;
create policy "admin_sessions_read_admin" on public.admin_sessions for select to authenticated using (public.is_admin());
grant select on public.admin_sessions to authenticated;

create table if not exists public.admin_login_events (
  id bigint generated always as identity primary key,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  event_type text not null,
  ip_address text,
  user_agent text,
  success boolean not null default true,
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists admin_login_events_admin_idx on public.admin_login_events (admin_user_id, created_at desc);

alter table public.admin_login_events enable row level security;
drop policy if exists "admin_login_events_read_admin" on public.admin_login_events;
create policy "admin_login_events_read_admin" on public.admin_login_events for select to authenticated using (public.is_admin());
grant select on public.admin_login_events to authenticated;

-- تسجيل حدث تسجيل دخول إداري
create or replace function public.log_admin_login_event(p_event_type text, p_success boolean, p_failure_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_admin uuid;
begin
  select id into v_admin from public.admin_users where profile_id = auth.uid() limit 1;
  insert into public.admin_login_events (admin_user_id, event_type, ip_address, user_agent, success, failure_reason)
  values (v_admin, p_event_type,
          nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for',
          nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent',
          coalesce(p_success, true), p_failure_reason);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.log_admin_login_event(text, boolean, text) from public;
grant execute on function public.log_admin_login_event(text, boolean, text) to authenticated;

-- ============ 9) audit_logs — سجل التدقيق الكامل ============
-- لا توجد سياسة update أو delete على هذا الجدول إطلاقًا (حتى للسوبر أدمن)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  ip_address text,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_read" on public.audit_logs;
create policy "audit_logs_read" on public.audit_logs for select to authenticated using (
  public.has_permission('audit.view')
  or public.has_admin_module('audit', false)
  or public.has_admin_module('security', false)
);
grant select on public.audit_logs to authenticated;

-- تسجيل تدقيق صريح (أثري) يستخدمه العنوان الجديد
create or replace function public.log_admin_audit(
  p_action text, p_resource_type text, p_resource_id text default null,
  p_old_values jsonb default null, p_new_values jsonb default null, p_reason text default null,
  p_request_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_id uuid;
begin
  select id into v_admin from public.admin_users where profile_id = auth.uid() limit 1;
  insert into public.audit_logs
    (admin_user_id, action, resource_type, resource_id, old_values, new_values, reason, ip_address, user_agent, request_id)
  values
    (v_admin, p_action, p_resource_type, p_resource_id, p_old_values, p_new_values, p_reason,
     nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for',
     nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent',
     p_request_id)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.log_admin_audit(text, text, text, jsonb, jsonb, text, text) from public;
grant execute on function public.log_admin_audit(text, text, text, jsonb, jsonb, text, text) to authenticated;

-- مزامنة: log_admin_action القديم يكتب أيضًا في audit_logs الجديد (سجل موحد من مصدر واحد)
create or replace function public.log_admin_action(
  p_action text,
  p_resource text,
  p_resource_id text default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_admin uuid;
begin
  select id into v_admin from public.admin_users where profile_id = auth.uid() limit 1;
  insert into public.admin_audit_logs (actor_id, action, resource, resource_id, reason, metadata, correlation_id)
  values (auth.uid(), p_action, p_resource, p_resource_id, p_reason, p_metadata, gen_random_uuid()::text)
  returning id into v_id;

  insert into public.audit_logs (admin_user_id, action, resource_type, resource_id, new_values, reason, request_id)
  values (v_admin, p_action, p_resource, p_resource_id,
          case when p_metadata = '{}'::jsonb then null else p_metadata end, p_reason, v_id::text);
  return v_id;
end $$;

revoke all on function public.log_admin_action(text, text, text, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, text, text, jsonb) to authenticated;

-- Trigger: تسجيل التغييرات تلقائيًا على الجداول الحساسة (قديم/جديد)
-- (نضمن وجود system_settings و feature_flags قبل ربط الـtrigger لأنهما قد لا يكونان منقولين بعد)
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.feature_flags (
  key text primary key,
  label_ar text not null,
  enabled boolean not null default false,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.audit_sensitive_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_admin uuid; v_ip text; v_ua text; v_rid text;
begin
  select id into v_admin from public.admin_users where profile_id = auth.uid() limit 1;
  v_ip := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for';
  v_ua := nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent';

  if tg_op = 'DELETE' then
    v_rid := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key');
    insert into public.audit_logs (admin_user_id, action, resource_type, resource_id, old_values, ip_address, user_agent)
    values (v_admin, 'DELETE_' || tg_table_name, tg_table_name, v_rid, to_jsonb(old), v_ip, v_ua);
    return old;
  elsif tg_op = 'INSERT' then
    v_rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key');
    insert into public.audit_logs (admin_user_id, action, resource_type, resource_id, new_values, ip_address, user_agent)
    values (v_admin, 'INSERT_' || tg_table_name, tg_table_name, v_rid, to_jsonb(new), v_ip, v_ua);
    return new;
  else
    if to_jsonb(old) is not distinct from to_jsonb(new) then return new; end if;
    v_rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key');
    insert into public.audit_logs (admin_user_id, action, resource_type, resource_id, old_values, new_values, ip_address, user_agent)
    values (v_admin, 'UPDATE_' || tg_table_name, tg_table_name, v_rid, to_jsonb(old), to_jsonb(new), v_ip, v_ua);
    return new;
  end if;
end $$;

drop trigger if exists trg_audit_admin_users on public.admin_users;
create trigger trg_audit_admin_users after insert or update or delete on public.admin_users for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_admin_user_roles on public.admin_user_roles;
create trigger trg_audit_admin_user_roles after insert or update or delete on public.admin_user_roles for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_role_permissions on public.role_permissions;
create trigger trg_audit_role_permissions after insert or update or delete on public.role_permissions for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_roles on public.roles;
create trigger trg_audit_roles after insert or update or delete on public.roles for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_permissions on public.permissions;
create trigger trg_audit_permissions after insert or update or delete on public.permissions for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_role_scopes on public.role_scopes;
create trigger trg_audit_role_scopes after insert or update or delete on public.role_scopes for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_system_settings on public.system_settings;
create trigger trg_audit_system_settings after insert or update or delete on public.system_settings for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_feature_flags on public.feature_flags;
create trigger trg_audit_feature_flags after insert or update or delete on public.feature_flags for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_payments on public.payments;
create trigger trg_audit_payments after insert or update or delete on public.payments for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_ledger_adjustments on public.ledger_adjustments;
create trigger trg_audit_ledger_adjustments after insert or update or delete on public.ledger_adjustments for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_prize_claims on public.prize_claims;
create trigger trg_audit_prize_claims after insert or update or delete on public.prize_claims for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_prediction_corrections on public.prediction_corrections;
create trigger trg_audit_prediction_corrections after insert or update or delete on public.prediction_corrections for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_arena_corrections on public.arena_corrections;
create trigger trg_audit_arena_corrections after insert or update or delete on public.arena_corrections for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_coupons on public.coupons;
create trigger trg_audit_coupons after insert or update or delete on public.coupons for each row execute function public.audit_sensitive_change();
drop trigger if exists trg_audit_approval_requests on public.approval_requests;
create trigger trg_audit_approval_requests after insert or update or delete on public.approval_requests for each row execute function public.audit_sensitive_change();

-- ============ 10) approval_requests — الطلبات الحساسة (Maker → Checker) ============
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  resource_type text not null,
  resource_id text,
  requested_by uuid not null references public.admin_users(id) on delete cascade,
  reviewed_by uuid references public.admin_users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired')),
  reason text not null,
  request_data jsonb not null default '{}'::jsonb,
  review_data jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists approval_requests_status_idx on public.approval_requests (status, created_at desc);
create index if not exists approval_requests_type_idx on public.approval_requests (request_type);

alter table public.approval_requests enable row level security;
drop policy if exists "approval_requests_read" on public.approval_requests;
create policy "approval_requests_read" on public.approval_requests for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.admin_users au where au.id = public.approval_requests.requested_by and au.profile_id = auth.uid())
);
grant select on public.approval_requests to authenticated;

-- خريطة نوع الطلب → الصلاحية المطلوبة لإنشائه واعتماده
create or replace function public.approval_permission(p_request_type text)
returns text
language sql immutable set search_path = public as $$
  select case p_request_type
    when 'wallet_adjustment' then 'wallets.adjust'
    when 'points_adjustment' then 'points.adjust'
    when 'match_result_correction' then 'matches.correct_result'
    when 'prediction_correction' then 'predictions.correct'
    when 'payment_refund' then 'payments.refund'
    when 'prize_redemption' then 'prizes.approve_redemption'
    when 'rbac_elevation' then 'security.manage_2fa'
    when 'maintenance_activate' then 'maintenance.activate'
    when 'notification_broadcast' then 'notifications.send'
    else null
  end;
$$;

-- إنشاء طلب اعتماد (Maker)
create or replace function public.create_approval_request(
  p_request_type text, p_resource_type text, p_resource_id text default null,
  p_reason text, p_request_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_perm text;
  v_id uuid;
begin
  select id into v_me from public.admin_users where profile_id = auth.uid();
  if v_me is null then return jsonb_build_object('error', 'NOT_ADMIN'); end if;
  v_perm := public.approval_permission(p_request_type);
  if v_perm is null or not public.has_permission(v_perm) then
    return jsonb_build_object('error', 'FORBIDDEN');
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('error', 'REASON_REQUIRED');
  end if;

  insert into public.approval_requests (request_type, resource_type, resource_id, requested_by, reason, request_data)
  values (p_request_type, p_resource_type, p_resource_id, v_me, trim(p_reason), coalesce(p_request_data, '{}'::jsonb))
  returning id into v_id;

  perform public.log_admin_action('approval_request', 'approval_requests', v_id::text,
    p_request_type || ' — ' || trim(p_reason));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.create_approval_request(text, text, text, text, jsonb) from public;
grant execute on function public.create_approval_request(text, text, text, text, jsonb) to authenticated;

-- اعتماد/رفض طلب (Checker) — لا يمكن للمنشئ اعتماد طلبه بنفسه (Maker → Checker)
create or replace function public.review_approval_request(
  p_request_id uuid, p_approve boolean, p_review_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_req public.approval_requests%rowtype;
  v_perm text;
begin
  select id into v_me from public.admin_users where profile_id = auth.uid();
  if v_me is null then return jsonb_build_object('error', 'NOT_ADMIN'); end if;

  select * into v_req from public.approval_requests where id = p_request_id for update;
  if v_req.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_req.status <> 'pending' then return jsonb_build_object('error', 'ALREADY_REVIEWED'); end if;
  if v_req.requested_by = v_me then return jsonb_build_object('error', 'SELF_APPROVAL'); end if;

  v_perm := public.approval_permission(v_req.request_type);
  if v_perm is null or not public.has_permission(v_perm) then
    return jsonb_build_object('error', 'FORBIDDEN');
  end if;

  update public.approval_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = v_me,
         reviewed_at = now(),
         review_data = jsonb_build_object('note', p_review_note, 'approve', p_approve)
   where id = p_request_id;

  perform public.log_admin_action('approval_review', 'approval_requests', p_request_id::text,
    v_req.request_type || ' -> ' || case when p_approve then 'approved' else 'rejected' end
    || coalesce(' — ' || p_review_note, ''));
  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end $$;

revoke all on function public.review_approval_request(uuid, boolean, text) from public;
grant execute on function public.review_approval_request(uuid, boolean, text) to authenticated;

-- ============ 11) System: feature_flags / maintenance_windows / backup_jobs ============
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;
drop policy if exists "system_settings_read" on public.system_settings;
create policy "system_settings_read" on public.system_settings for select to authenticated using (true);
drop policy if exists "system_settings_write_admin" on public.system_settings;
create policy "system_settings_write_admin" on public.system_settings for update to authenticated using (public.has_permission('settings.update'));
grant select on public.system_settings to authenticated, anon;

create table if not exists public.feature_flags (
  key text primary key,
  label_ar text not null,
  enabled boolean not null default false,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
drop policy if exists "feature_flags_read" on public.feature_flags;
create policy "feature_flags_read" on public.feature_flags for select to authenticated using (true);
drop policy if exists "feature_flags_write_admin" on public.feature_flags;
create policy "feature_flags_write_admin" on public.feature_flags for update to authenticated using (public.has_permission('settings.manage_feature_flags'));
grant select on public.feature_flags to authenticated, anon;

insert into public.feature_flags (key, label_ar, enabled, description) values
  ('arenas_enabled', 'حلبات التوقعات', true, 'تفعيل وإظهار قسم الحلبات في التطبيق.'),
  ('coach_enabled', 'أنت المدرب (فانتازي)', true, 'تفعيل وضع المدرب واختيار التشكيلة.'),
  ('quiz_enabled', 'بنك الأسئلة', true, 'تفعيل الأسئلة اليومية.'),
  ('store_enabled', 'المتجر والجوائز', true, 'تفعيل المتجر واسترداد الجوائز.'),
  ('challenges_enabled', 'التحديات', true, 'تفعيل التحديات الأسبوعية.'),
  ('referrals_enabled', 'دعوة الأصدقاء', true, 'تفعيل نظام الإحالة ومكافآته.'),
  ('ads_enabled', 'الإعلانات', false, 'تفعيل عرض الإعلانات في التطبيق.')
on conflict (key) do nothing;

create table if not exists public.maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message_ar text,
  status text not null default 'scheduled' check (status in ('scheduled','active','finished','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.maintenance_windows enable row level security;
drop policy if exists "maintenance_windows_read" on public.maintenance_windows;
create policy "maintenance_windows_read" on public.maintenance_windows for select to authenticated using (true);
drop policy if exists "maintenance_windows_write_admin" on public.maintenance_windows;
create policy "maintenance_windows_write_admin" on public.maintenance_windows for insert to authenticated with check (public.has_permission('maintenance.create'));
create policy "maintenance_windows_update_admin" on public.maintenance_windows for update to authenticated using (public.has_permission('maintenance.update'));
grant select, insert, update on public.maintenance_windows to authenticated;

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null default 'manual',
  status text not null default 'requested' check (status in ('requested','running','completed','failed')),
  details jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.backup_jobs enable row level security;
drop policy if exists "backup_jobs_read_admin" on public.backup_jobs;
create policy "backup_jobs_read_admin" on public.backup_jobs for select to authenticated using (public.is_admin());
grant select on public.backup_jobs to authenticated;

-- ============ 12) ملخص التحقق ============
create or replace function public.rbac_health_check()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_perms int; v_roles int; v_admin_users int; v_orphan int;
begin
  select count(*) into v_perms from public.permissions;
  select count(*) into v_roles from public.roles where status = 'active';
  select count(*) into v_admin_users from public.admin_users where deleted_at is null;
  select count(*) into v_orphan from public.admin_user_roles aur
    left join public.roles r on r.id = aur.role_id
    where r.id is null;
  return jsonb_build_object(
    'permissions', v_perms,
    'active_roles', v_roles,
    'admin_users', v_admin_users,
    'orphan_role_links', v_orphan
  );
end $$;

revoke all on function public.rbac_health_check() from public;
grant execute on function public.rbac_health_check() to authenticated;