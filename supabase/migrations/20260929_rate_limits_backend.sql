-- ============================================================
-- 2026-09-29 — Backend Rate Limiting لكل مستخدم (الطبقة الداخلية)
-- مكمّل لـ Cloudflare Rate Limits (cloudflare/rate-limits.json):
--   CF = coarse (IP/header عند الحافة) → هنا = fine (لكل مستخدم auth.uid()).
-- يمنع إغراق العمليات الحساسة حتى لو خُطّي CF أو وصل مباشرة للـ API.
-- يشمل:
--   1) api_rate_limits + rate_limit_policies (سياسات قابلة للضبط)
--   2) api_check_rate (استهلاك/فحص ذرّي بنوافذ متحركة كسولة + حجب)
--   3) admin_upsert_rate_limit / admin_reset_rate_limit (مع تدقيق)
--   4) دمج الفحص في العمليات الحساسة:
--      create_approval_request (approval.create) · exec_approval (approval.exec)
--      admin_create_match / admin_upsert_fixtures (matches.manage)
--      admin_payment_review (payments.review) · admin_ledger_review (ledger.adjust)
-- ============================================================

-- ---------- 1) الجداول ----------
create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  user_id uuid not null,
  bucket_start timestamptz not null default now(),
  count int not null default 0,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, user_id)
);
create index if not exists api_rate_limits_user_idx on public.api_rate_limits (user_id);
create index if not exists api_rate_limits_blocked_idx on public.api_rate_limits (blocked_until);

create table if not exists public.rate_limit_policies (
  scope text primary key,
  limit_per_window int not null default 60 check (limit_per_window >= 1),
  window_seconds int not null default 60 check (window_seconds >= 1),
  block_seconds int not null default 0 check (block_seconds >= 0),
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;
drop policy if exists "rl_read_own" on public.api_rate_limits;
create policy "rl_read_own" on public.api_rate_limits for select to authenticated using (user_id = auth.uid());
drop policy if exists "rl_read_admin" on public.api_rate_limits;
create policy "rl_read_admin" on public.api_rate_limits for select to authenticated using (public.is_admin());
grant select on public.api_rate_limits to authenticated;

alter table public.rate_limit_policies enable row level security;
drop policy if exists "rlp_read" on public.rate_limit_policies;
create policy "rlp_read" on public.rate_limit_policies for select to authenticated using (true);
grant select on public.rate_limit_policies to authenticated;

-- ---------- السياسات الافتراضية (تتزامن مع cloudflare/rate-limits.json) ----------
insert into public.rate_limit_policies (scope, limit_per_window, window_seconds, block_seconds, description) values
  ('approval.create',   20, 60, 0,   'إنشاء طلبات الاعتماد (Maker) — §10'),
  ('approval.exec',     30, 60, 0,   'تنفيذ الطلبات المعتمدة — §34'),
  ('matches.manage',    20, 60, 0,   'إنشاء/مزامنة المباريات — §12'),
  ('payments.review',   20, 60, 0,   'مراجعة/استرداد الدفعات — §16'),
  ('ledger.adjust',     20, 60, 0,   'اعتماد تعديلات المحفظة/النقاط اليدوية — §14/§15'),
  ('auth.login',         5, 60, 600, 'محاولات الدخول الفاشلة — §4'),
  ('auth.otp',           5, 60, 600, 'OTP/2FA verify — §4'),
  ('predictions.submit', 30, 60, 0,  'إرسال/تعديل التوقعات — §13'),
  ('quiz.answers',       5, 60, 0,   'إجابات Quiz — §19'),
  ('notifications.send',20, 60, 0,   'إرسال إشعارات جماعية — §23'),
  ('admin.operations', 120, 60, 0,   'عمليات إدارية عامة — §5..§10')
on conflict (scope) do nothing;

-- ---------- 2) api_check_rate ----------
create or replace function public.api_check_rate(
  p_scope text,
  p_limit int default null,
  p_window_seconds int default null,
  p_block_seconds int default null,
  p_consume boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_policy public.rate_limit_policies%rowtype;
  v_limit int;
  v_window int;
  v_block int;
  v_row public.api_rate_limits%rowtype;
  v_retry int;
begin
  if v_user is null then return public.api_error('UNAUTHENTICATED', 'مطلوب هوية مستخدم للحد من المعدل'); end if;
  select * into v_policy from public.rate_limit_policies where scope = p_scope;
  v_limit := coalesce(p_limit, v_policy.limit_per_window, 60);
  v_window := coalesce(p_window_seconds, v_policy.window_seconds, 60);
  v_block := coalesce(p_block_seconds, v_policy.block_seconds, 0);

  select * into v_row from public.api_rate_limits where scope = p_scope and user_id = v_user for update;
  if v_row.id is null then
    insert into public.api_rate_limits (scope, user_id, bucket_start, count, blocked_until)
    values (p_scope, v_user, now(), 0, null)
    on conflict (scope, user_id) do nothing;
    select * into v_row from public.api_rate_limits where scope = p_scope and user_id = v_user for update;
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    v_retry := greatest(1, ceil(extract(epoch from (v_row.blocked_until - now())))::int);
    return public.api_error('RATE_LIMITED', 'تجاوزت الحد المسموح، حاول لاحقًا',
      jsonb_build_object('scope', p_scope, 'current', v_row.count, 'limit', v_limit, 'retry_after', v_retry));
  end if;

  if v_row.bucket_start is null or v_row.bucket_start + make_interval(secs => v_window) <= now() then
    update public.api_rate_limits set bucket_start = now(), count = 0, blocked_until = null
     where scope = p_scope and user_id = v_user;
    v_row.bucket_start := now(); v_row.count := 0; v_row.blocked_until := null;
  end if;

  if v_row.count >= v_limit then
    v_block := greatest(v_block, v_window);
    update public.api_rate_limits set blocked_until = now() + make_interval(secs => v_block)
     where scope = p_scope and user_id = v_user;
    v_retry := greatest(1, v_block);
    return public.api_error('RATE_LIMITED', 'تجاوزت الحد المسموح، حاول لاحقًا',
      jsonb_build_object('scope', p_scope, 'current', v_row.count, 'limit', v_limit, 'retry_after', v_retry));
  end if;

  if p_consume then
    update public.api_rate_limits set count = count + 1, updated_at = now()
     where scope = p_scope and user_id = v_user returning count into v_row.count;
  end if;

  return public.api_ok(jsonb_build_object('scope', p_scope, 'current', v_row.count, 'limit', v_limit, 'reset_after_seconds', v_window));
end $$;

revoke all on function public.api_check_rate(text, int, int, int, boolean) from public;
grant execute on function public.api_check_rate(text, int, int, int, boolean) to authenticated;

-- ---------- 3) ضبط السياسات (Admin) ----------
create or replace function public.admin_upsert_rate_limit(
  p_scope text, p_limit int, p_window_seconds int default 60, p_block_seconds int default 0, p_description text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return public.api_error('FORBIDDEN', 'عملية إدارية محمية'); end if;
  if nullif(trim(coalesce(p_scope, '')), '') is null or p_limit is null or p_limit < 1 or p_window_seconds is null or p_window_seconds < 1 then
    return public.api_error('VALIDATION_ERROR', 'scope و limit و window_seconds مطلوبة بقيم صحيحة');
  end if;
  insert into public.rate_limit_policies (scope, limit_per_window, window_seconds, block_seconds, description, updated_by)
  values (trim(p_scope), p_limit, p_window_seconds, coalesce(p_block_seconds, 0), p_description, auth.uid())
  on conflict (scope) do update
    set limit_per_window = excluded.limit_per_window,
        window_seconds = excluded.window_seconds,
        block_seconds = coalesce(excluded.block_seconds, 0),
        description = coalesce(excluded.description, rate_limit_policies.description),
        updated_by = excluded.updated_by,
        updated_at = now();
  perform public.log_admin_action('rate_limit_upsert', 'rate_limit_policies', trim(p_scope),
    p_scope || ' -> ' || p_limit || ' / ' || p_window_seconds || 's' || coalesce(' (block ' || p_block_seconds || ')', ''));
  return public.api_ok(jsonb_build_object('scope', trim(p_scope), 'limit', p_limit, 'window_seconds', p_window_seconds, 'block_seconds', coalesce(p_block_seconds, 0)));
end $$;

revoke all on function public.admin_upsert_rate_limit(text, int, int, int, text) from public;
grant execute on function public.admin_upsert_rate_limit(text, int, int, int, text) to authenticated;

-- إعادة تعيين عدّاد/حجب مستخدم أو نطاق كامل (دعم/تصعيد)
create or replace function public.admin_reset_rate_limit(p_scope text, p_user_id uuid default null, p_reset_all boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deleted int := 0;
begin
  if not public.is_admin() then return public.api_error('FORBIDDEN', 'عملية إدارية محمية'); end if;
  if nullif(trim(coalesce(p_scope, '')), '') is null then
    return public.api_error('VALIDATION_ERROR', 'scope مطلوب');
  end if;
  if p_reset_all then
    delete from public.api_rate_limits where scope = trim(p_scope);
    get diagnostics v_deleted = row_count;
  elsif p_user_id is null then
    return public.api_error('VALIDATION_ERROR', 'حدد المستخدم أو p_reset_all');
  else
    delete from public.api_rate_limits where scope = trim(p_scope) and user_id = p_user_id;
    get diagnostics v_deleted = row_count;
  end if;
  perform public.log_admin_action('rate_limit_reset', 'api_rate_limits', trim(p_scope) || coalesce(' @ ' || p_user_id::text, ''),
    'حذف ' || v_deleted || ' عدّاد');
  return public.api_ok(jsonb_build_object('scope', trim(p_scope), 'deleted', v_deleted));
end $$;

revoke all on function public.admin_reset_rate_limit(text, uuid, boolean) from public;
grant execute on function public.admin_reset_rate_limit(text, uuid, boolean) to authenticated;

-- ============================================================
-- 4) دمج فحص المعدل في العمليات الحساسة (المحافظة على الربط القديم/الجديد)
-- ============================================================

-- 4.1) create_approval_request — قديم (returns {error:...})
create or replace function public.create_approval_request(
  p_request_type text, p_resource_type text, p_resource_id text default null,
  p_reason text default null, p_request_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_perm text;
  v_id uuid;
  v_rate jsonb;
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

  v_rate := public.api_check_rate('approval.create');
  if (v_rate->>'success') = 'false' then
    return jsonb_build_object('error', 'RATE_LIMITED', 'message', v_rate->'error'->>'message',
      'retry_after', (v_rate->'error'->'details'->>'retry_after')::int);
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

-- 4.2) exec_approval — جديد (envelope) مع فحص قبل التنفيذ
create or replace function public.exec_approval(p_request_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid;
  v_req public.approval_requests%rowtype;
  v_perm text;
  v_result jsonb;
  v_amount int;
  v_balance int;
  v_before int;
  v_idem text;
  v_rate jsonb;
begin
  select id into v_me from public.admin_users where profile_id = auth.uid();
  if v_me is null then return public.api_error('NOT_ADMIN', 'هوية المشرف غير موجودة'); end if;

  v_rate := public.api_check_rate('approval.exec');
  if (v_rate->>'success') = 'false' then return v_rate; end if;

  select * into v_req from public.approval_requests where id = p_request_id for update;
  if v_req.id is null then return public.api_error('NOT_FOUND', 'طلب الاعتماد غير موجود'); end if;
  if v_req.status = 'completed' then
    return public.api_error('ALREADY_EXECUTED', 'الطلب نُفّذ واكتمل سابقاً');
  end if;
  if v_req.status <> 'approved' then
    return public.api_error('INVALID_STATE', 'لا يمكن تنفيذ طلب بحالة ' || v_req.status);
  end if;

  v_perm := public.approval_permission(v_req.request_type);
  if v_perm is null then
    return public.api_error('EXECUTION_NOT_SUPPORTED', 'لا يوجد مسار تنفيذ آلي لنوع الطلب ' || v_req.request_type);
  end if;
  if not public.has_permission(v_perm) then
    return public.api_error('FORBIDDEN', 'لا تملك صلاحية ' || v_perm || ' لتنفيذ هذا الطلب');
  end if;

  update public.approval_requests
     set status = 'executing', executed_by = v_me, executed_at = now()
   where id = p_request_id;
  perform public.log_admin_action('approval_executing', 'approval_requests', p_request_id::text,
    v_req.request_type || coalesce(' — ' || p_reason, ''));

  begin
    case v_req.request_type
      when 'wallet_adjustment' then
        if v_req.resource_id is null or v_req.resource_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_result := public.api_error('VALIDATION_ERROR', 'resource_id يجب أن يكون معرّف المستخدم (UUID)');
        else
          v_amount := coalesce((v_req.request_data->>'amount')::int, 0);
          if v_amount <= 0 then
            v_result := public.api_error('VALIDATION_ERROR', 'المبلغ غير صالح في بيانات الطلب');
          else
            v_idem := 'approval:' || v_req.id::text;
            if exists (select 1 from public.wallet_transactions where idempotency_key = v_idem) then
              v_result := public.api_error('ALREADY_EXECUTED', 'العملية نُفّذت سابقاً');
            else
              v_amount := case when v_req.request_data->>'direction' = 'debit' then -v_amount else v_amount end;
              select bamba_balance into v_before from public.profiles where id = (v_req.resource_id)::uuid for update;
              if v_before + v_amount < 0 then
                v_result := public.api_error('INSUFFICIENT_BALANCE', 'الرصيد غير كافٍ لعملية الخصم');
              else
                update public.profiles set bamba_balance = bamba_balance + v_amount
                  where id = (v_req.resource_id)::uuid returning bamba_balance into v_balance;
                insert into public.wallet_transactions
                  (user_id, type, amount, balance_before, balance_after, source_type, source_id, created_by, approved_by, idempotency_key, metadata)
                values ((v_req.resource_id)::uuid, 'adjustment', v_amount, v_before, v_balance,
                        'approval', v_req.id::text, auth.uid(), auth.uid(), v_idem,
                        jsonb_build_object('reason', v_req.reason, 'approval_request_id', v_req.id::text, 'direction', v_req.request_data->>'direction'));
                v_result := public.api_ok(jsonb_build_object('user_id', v_req.resource_id, 'amount', v_amount, 'balance_after', v_balance));
              end if;
            end if;
          end if;
        end if;

      when 'points_adjustment' then
        if v_req.resource_id is null or v_req.resource_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_result := public.api_error('VALIDATION_ERROR', 'resource_id يجب أن يكون معرّف المستخدم (UUID)');
        else
          v_amount := coalesce((v_req.request_data->>'amount')::int, 0);
          if v_amount = 0 then
            v_result := public.api_error('VALIDATION_ERROR', 'المبلغ غير صالح في بيانات الطلب');
          else
            update public.profiles set user_points = greatest(user_points + v_amount, 0)
              where id = (v_req.resource_id)::uuid;
            insert into public.points_ledger (user_id, points_before, points_delta, points_after, source_type, source_id, rule_version)
              select id, user_points - v_amount, v_amount, user_points, 'approval', v_req.id::text, 1
              from public.profiles where id = (v_req.resource_id)::uuid;
            v_result := public.api_ok(jsonb_build_object('user_id', v_req.resource_id, 'amount', v_amount));
          end if;
        end if;

      when 'match_result_correction' then
        v_result := public.execute_match_result_approval(v_req.id, v_req.resource_id, v_req.request_data);

      when 'payment_refund' then
        declare
          v_pay public.payments%rowtype;
          v_refund int;
        begin
          if v_req.resource_id is null or v_req.resource_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            v_result := public.api_error('VALIDATION_ERROR', 'resource_id يجب أن يكون معرّف الدفعة (UUID)');
          else
            select * into v_pay from public.payments where id = (v_req.resource_id)::uuid for update;
            if v_pay.id is null then
              v_result := public.api_error('NOT_FOUND', 'الدفعة غير موجودة');
            elsif v_pay.status = 'refunded' then
              v_result := public.api_error('ALREADY_EXECUTED', 'الدفعة مستردة سابقاً');
            else
              v_refund := v_pay.bamba_amount;
              v_idem := 'refund:' || v_pay.id::text;
              if exists (select 1 from public.wallet_transactions where idempotency_key = v_idem) then
                v_result := public.api_error('ALREADY_EXECUTED', 'الدفعة مستردة سابقاً');
              else
                select bamba_balance into v_before from public.profiles where id = v_pay.user_id for update;
                if v_before < v_refund then
                  v_result := public.api_error('INSUFFICIENT_BALANCE', 'رصيد المستخدم لا يكفي للاسترداد');
                else
                  update public.profiles set bamba_balance = bamba_balance - v_refund
                    where id = v_pay.user_id returning bamba_balance into v_balance;
                  insert into public.wallet_transactions
                    (user_id, type, amount, balance_before, balance_after, source_type, source_id, created_by, approved_by, idempotency_key, metadata)
                  values (v_pay.user_id, 'withdraw', -v_refund, v_before, v_balance,
                          'payment_refund', v_pay.id::text, auth.uid(), auth.uid(), v_idem,
                          jsonb_build_object('reason', v_req.reason, 'approval_request_id', v_req.id::text, 'ref', v_pay.reference_no));
                  update public.payments
                     set status = 'refunded', reason = coalesce(v_req.reason, 'استرداد'), reviewed_by = auth.uid(), reviewed_at = now()
                   where id = v_pay.id;
                  v_result := public.api_ok(jsonb_build_object('payment_id', v_pay.id::text, 'refunded_amount', v_refund));
                end if;
              end if;
            end if;
          end if;
        end;

      else
        v_result := public.api_error('EXECUTION_NOT_SUPPORTED', 'لا يوجد تنفيذ آلي بعد لنوع الطلب ' || v_req.request_type);
    end case;
  exception when others then
    -- أي خطأ غير متوقع: نعيد الطلب لحالة المراجعة ولا نتركه معلقاً
    update public.approval_requests
       set status = 'approved', executed_by = null, executed_at = null,
           review_data = jsonb_build_object('execution_error', sqlerrm)
     where id = p_request_id;
    return public.api_error('INTERNAL_ERROR', sqlerrm);
  end;

  if (v_result->>'success') = 'true' then
    update public.approval_requests
       set status = 'completed',
           review_data = jsonb_build_object('execution_result', v_result->'data', 'note', p_reason)
     where id = p_request_id;
    perform public.log_admin_action('approval_completed', 'approval_requests', p_request_id::text,
      v_req.request_type || ' — ' || v_req.resource_type || ' #' || coalesce(v_req.resource_id, '-'));
    return v_result;
  else
    update public.approval_requests
       set status = 'approved', executed_by = null, executed_at = null,
           review_data = jsonb_build_object('execution_failed', v_result->'error', 'note', p_reason)
     where id = p_request_id;
    perform public.log_admin_action('approval_execution_failed', 'approval_requests', p_request_id::text,
      coalesce(v_result->'error'->>'code', 'ERROR') || ' — ' || coalesce(v_result->'error'->>'message', ''));
    return v_result;
  end if;
end $$;

revoke all on function public.exec_approval(uuid, text) from public;
grant execute on function public.exec_approval(uuid, text) to authenticated;

-- 4.3) admin_create_match — قديم
create or replace function public.admin_create_match(
  p_league text, p_home text, p_away text, p_home_short text, p_away_short text,
  p_time text, p_points int, p_featured boolean, p_match_date date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match public.admin_matches%rowtype;
  v_rate jsonb;
begin
  if not public.has_admin_module('matches', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if nullif(trim(coalesce(p_home, '')), '') is null or nullif(trim(coalesce(p_away, '')), '') is null then
    return jsonb_build_object('error', 'MISSING_TEAMS');
  end if;

  v_rate := public.api_check_rate('matches.manage');
  if (v_rate->>'success') = 'false' then
    return jsonb_build_object('error', 'RATE_LIMITED', 'message', v_rate->'error'->>'message',
      'retry_after', (v_rate->'error'->'details'->>'retry_after')::int);
  end if;

  insert into public.admin_matches
    (league, home, away, home_short, away_short, time, points, featured, status, match_date, created_by)
  values (
    coalesce(nullif(trim(coalesce(p_league, '')), ''), 'دوري أبطال أوروبا'),
    trim(p_home), trim(p_away),
    coalesce(nullif(trim(coalesce(p_home_short, '')), ''), left(trim(p_home), 2)),
    coalesce(nullif(trim(coalesce(p_away_short, '')), ''), left(trim(p_away), 2)),
    coalesce(nullif(trim(coalesce(p_time, '')), ''), '21:00'),
    coalesce(p_points, 3), coalesce(p_featured, false),
    'upcoming', coalesce(p_match_date, current_date), auth.uid()
  )
  returning * into v_match;

  perform public.log_admin_action(
    'create_match', 'admin_matches', v_match.id::text,
    v_match.home || ' vs ' || v_match.away || ' (' || v_match.match_date || ')'
  );
  return jsonb_build_object('ok', true, 'id', v_match.id, 'code', v_match.id);
end $$;

revoke all on function public.admin_create_match(text, text, text, text, text, text, int, boolean, date) from public;
grant execute on function public.admin_create_match(text, text, text, text, text, text, int, boolean, date) to authenticated;

-- 4.4) admin_upsert_fixtures — قديم
create or replace function public.admin_upsert_fixtures(p_fixtures jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_dup int := 0;
  v_f jsonb;
  v_date date;
  v_points int;
  v_featured boolean;
  v_external text;
  v_rate jsonb;
begin
  if not public.has_admin_module('matches', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_fixtures is null or jsonb_typeof(p_fixtures) <> 'array' then
    return jsonb_build_object('error', 'INVALID_FIXTURES');
  end if;

  v_rate := public.api_check_rate('matches.manage');
  if (v_rate->>'success') = 'false' then
    return jsonb_build_object('error', 'RATE_LIMITED', 'message', v_rate->'error'->>'message',
      'retry_after', (v_rate->'error'->'details'->>'retry_after')::int);
  end if;

  for v_f in select * from jsonb_array_elements(p_fixtures)
  loop
    if nullif(trim(v_f->>'home'), '') is null or nullif(trim(v_f->>'away'), '') is null then
      continue;
    end if;
    v_date := coalesce((v_f->>'match_date')::date, current_date);
    v_points := coalesce((v_f->>'points')::int, 3);
    v_featured := coalesce((v_f->>'featured')::boolean, false);
    v_external := nullif(v_f->>'external_id', '');

    if exists (
      select 1 from public.admin_matches m
      where (v_external is not null and m.external_id = v_external)
         or (m.match_date = v_date
             and lower(m.home) = lower(trim(v_f->>'home'))
             and lower(m.away) = lower(trim(v_f->>'away')))
    ) then
      v_dup := v_dup + 1;
      continue;
    end if;

    insert into public.admin_matches
      (league, home, away, home_short, away_short, time, points, featured, status, match_date, created_by, external_id)
    values (
      coalesce(nullif(trim(v_f->>'league'), ''), 'دوري غير محدد'),
      trim(v_f->>'home'), trim(v_f->>'away'),
      coalesce(nullif(trim(v_f->>'home_short'), ''), left(trim(v_f->>'home'), 2)),
      coalesce(nullif(trim(v_f->>'away_short'), ''), left(trim(v_f->>'away'), 2)),
      coalesce(nullif(trim(v_f->>'time'), ''), '21:00'),
      v_points, v_featured,
      'upcoming', v_date, auth.uid(), v_external
    );
    v_count := v_count + 1;
  end loop;

  perform public.log_admin_action(
    'sync_fixtures', 'admin_matches', null,
    v_count || ' مباراة جديدة، ' || v_dup || ' مكررة'
  );
  return jsonb_build_object('ok', true, 'inserted', v_count, 'duplicates', v_dup);
end $$;

revoke all on function public.admin_upsert_fixtures(jsonb) from public;
grant execute on function public.admin_upsert_fixtures(jsonb) to authenticated;

-- 4.5) admin_payment_review — قديم
create or replace function public.admin_payment_review(p_payment_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payments%rowtype;
  v_balance int;
  v_before int;
  v_idem text;
  v_rate jsonb;
begin
  if not public.has_admin_module('payments', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_status not in ('success','failed','cancelled') then return jsonb_build_object('error', 'INVALID_STATUS'); end if;

  v_rate := public.api_check_rate('payments.review');
  if (v_rate->>'success') = 'false' then
    return jsonb_build_object('error', 'RATE_LIMITED', 'message', v_rate->'error'->>'message',
      'retry_after', (v_rate->'error'->'details'->>'retry_after')::int);
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_pay.status <> 'pending' then return jsonb_build_object('error', 'ALREADY_REVIEWED'); end if;

  if p_status = 'success' then
    v_idem := 'payment:' || v_pay.id::text;
    if exists (select 1 from public.wallet_transactions where idempotency_key = v_idem) then
      return jsonb_build_object('error', 'ALREADY_CREDITED');
    end if;
    select bamba_balance into v_before from public.profiles where id = v_pay.user_id for update;
    update public.profiles set bamba_balance = bamba_balance + v_pay.bamba_amount
      where id = v_pay.user_id returning bamba_balance into v_balance;
    insert into public.wallet_transactions
      (user_id, type, amount, balance_before, balance_after, source_type, source_id, created_by, approved_by, idempotency_key, metadata)
    values (v_pay.user_id, 'deposit', v_pay.bamba_amount, v_before, v_balance, 'payment', v_pay.id::text,
            auth.uid(), auth.uid(), v_idem, jsonb_build_object('package', v_pay.package_name, 'ref', v_pay.reference_no));
  end if;

  update public.payments
     set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), reason = p_reason
   where id = p_payment_id;

  perform public.log_admin_action('payment_review', 'payments', p_payment_id::text,
    p_status || coalesce(' — ' || p_reason, ''), jsonb_build_object('amount', v_pay.bamba_amount));
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

revoke all on function public.admin_payment_review(uuid, text, text) from public;
grant execute on function public.admin_payment_review(uuid, text, text) to authenticated;

-- 4.6) admin_ledger_review — قديم
create or replace function public.admin_ledger_review(p_adj_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_adj public.ledger_adjustments%rowtype;
  v_balance int;
  v_before int;
  v_idem text;
  v_rate jsonb;
begin
  if not public.has_admin_module('wallet', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_status not in ('approved','rejected') then return jsonb_build_object('error', 'INVALID_STATUS'); end if;

  v_rate := public.api_check_rate('ledger.adjust');
  if (v_rate->>'success') = 'false' then
    return jsonb_build_object('error', 'RATE_LIMITED', 'message', v_rate->'error'->>'message',
      'retry_after', (v_rate->'error'->'details'->>'retry_after')::int);
  end if;

  select * into v_adj from public.ledger_adjustments where id = p_adj_id for update;
  if v_adj.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_adj.status <> 'pending' then return jsonb_build_object('error', 'ALREADY_REVIEWED'); end if;

  if p_status = 'approved' then
    if v_adj.kind = 'wallet' then
      if v_adj.amount < 0 then
        select bamba_balance into v_before from public.profiles where id = v_adj.user_id for update;
        if v_before + v_adj.amount < 0 then
          return jsonb_build_object('error', 'INSUFFICIENT_BALANCE');
        end if;
      end if;
      v_idem := 'ledger:' || v_adj.id::text;
      if exists (select 1 from public.wallet_transactions where idempotency_key = v_idem) then
        return jsonb_build_object('error', 'ALREADY_EXECUTED');
      end if;
      select bamba_balance into v_before from public.profiles where id = v_adj.user_id for update;
      update public.profiles set bamba_balance = bamba_balance + v_adj.amount
        where id = v_adj.user_id returning bamba_balance into v_balance;
      insert into public.wallet_transactions
        (user_id, type, amount, balance_before, balance_after, source_type, source_id, created_by, approved_by, idempotency_key, metadata)
      values (v_adj.user_id, 'adjustment', v_adj.amount, v_before, v_balance, 'admin_adjustment', v_adj.id::text,
              coalesce(v_adj.requested_by, auth.uid()), auth.uid(), v_idem, jsonb_build_object('reason', v_adj.reason));
    elsif v_adj.kind = 'points' then
      update public.profiles set user_points = greatest(user_points + v_adj.amount, 0)
        where id = v_adj.user_id;
      insert into public.points_ledger (user_id, points_before, points_delta, points_after, source_type, source_id, rule_version)
        select id, user_points - v_adj.amount, v_adj.amount, user_points, 'admin_adjustment', v_adj.id::text, 1
        from public.profiles where id = v_adj.user_id;
    end if;
  end if;

  update public.ledger_adjustments
     set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_adj_id;

  perform public.log_admin_action('ledger_review', 'ledger_adjustments', p_adj_id::text,
    v_adj.kind || ' ' || p_status || coalesce(' — ' || p_reason, ''),
    jsonb_build_object('user_id', v_adj.user_id, 'amount', v_adj.amount));
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

revoke all on function public.admin_ledger_review(uuid, text, text) from public;
grant execute on function public.admin_ledger_review(uuid, text, text) to authenticated;

-- ============================================================
-- ملاحظة: دالة api_check_rate أعلاه تستدعي auth.uid() (المستدعي) —
-- أي حد لكل مستخدم/مشرف، يكمل الطبقة الخارجية لـ Cloudflare (الـ IP).
-- ============================================================