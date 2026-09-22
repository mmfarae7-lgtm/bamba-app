-- ============================================================
-- 2026-09-28 — النواة العرضية لعقد الـ API (docs/admin-api-contract.md)
-- 1) Response Envelope موحّد: {success, data, error, meta(request_id)}
-- 2) مخزن Idempotency عام (§35) + begin/complete مع استئناف للطلبات العالقة
-- 3) مصفوفة موافقات executing→completed (§34) + تنفيذ فعلي بأمان
--    (wallet_adjustment / points_adjustment / match_result_correction / payment_refund)
-- 4) Authorization Check على مورد + نطاق (§9): {allowed, requires_approval, scope}
-- ============================================================

-- ---------- 1) Envelope ----------
create or replace function public.api_ok(p_data jsonb default '{}'::jsonb)
returns jsonb
language sql set search_path = public as $$
  select jsonb_build_object(
    'success', true,
    'data', coalesce(p_data, '{}'::jsonb),
    'meta', jsonb_build_object('request_id', 'req_' || left(replace(gen_random_uuid()::text, '-', ''), 18))
  );
$$;

create or replace function public.api_error(
  p_code text, p_message text default null, p_details jsonb default '{}'::jsonb
) returns jsonb
language sql set search_path = public as $$
  select jsonb_build_object(
    'success', false,
    'error', jsonb_build_object(
      'code', p_code,
      'message', coalesce(nullif(trim(coalesce(p_message, '')), ''), p_code),
      'details', coalesce(p_details, '{}'::jsonb)
    ),
    'meta', jsonb_build_object('request_id', 'req_' || left(replace(gen_random_uuid()::text, '-', ''), 18))
  );
$$;

-- ---------- 2) Idempotency Store (§35) ----------
create table if not exists public.idempotency_keys (
  key text primary key,
  operation text not null,
  request_id text not null,
  status text not null default 'processing' check (status in ('processing','done')),
  response jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idempotency_keys_created_idx on public.idempotency_keys (created_at);

alter table public.idempotency_keys enable row level security;
drop policy if exists "idem_read_admin" on public.idempotency_keys;
create policy "idem_read_admin" on public.idempotency_keys for select to authenticated using (public.is_admin());
grant select on public.idempotency_keys to authenticated;

-- بدء عملية حساسة: يمنع التنفيذ المزدوج (نفس المفتاح = نفس العملية مرة واحدة)
create or replace function public.begin_idempotent(p_key text, p_operation text default 'operation')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_request_id text := 'req_' || left(replace(gen_random_uuid()::text, '-', ''), 18);
  v_existing public.idempotency_keys%rowtype;
begin
  if not public.is_admin() then return public.api_error('FORBIDDEN', 'عملية إدارية محمية'); end if;
  if nullif(trim(coalesce(p_key, '')), '') is null then
    return public.api_error('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key مطلوب لهذه العملية');
  end if;

  select * into v_existing from public.idempotency_keys where key = trim(p_key) for update;
  if v_existing.key is not null then
    if v_existing.status = 'done' then
      return jsonb_build_object('already_processed', true,
        'request_id', v_existing.request_id, 'response', v_existing.response);
    end if;
    if v_existing.created_at > now() - interval '10 minutes' then
      return jsonb_build_object('processing', true, 'request_id', v_existing.request_id);
    end if;
    -- عملية عالقة منذ زمن → استئناف مسموح
    update public.idempotency_keys
       set status = 'processing', request_id = v_request_id, created_at = now()
     where key = trim(p_key);
    return jsonb_build_object('request_id', v_request_id);
  end if;

  insert into public.idempotency_keys (key, operation, request_id, status, created_by)
  values (trim(p_key), p_operation, v_request_id, 'processing', auth.uid())
  on conflict (key) do nothing;

  select * into v_existing from public.idempotency_keys where key = trim(p_key);
  if v_existing.status = 'done' then
    return jsonb_build_object('already_processed', true,
      'request_id', v_existing.request_id, 'response', v_existing.response);
  end if;
  return jsonb_build_object('request_id', v_existing.request_id);
end $$;

revoke all on function public.begin_idempotent(text, text) from public;
grant execute on function public.begin_idempotent(text, text) to authenticated;

-- إكمال عملية حساسة وحفظ ناتجها (يردّ به على أي طلب مكرر لاحقاً)
create or replace function public.complete_idempotent(p_key text, p_response jsonb default '{"ok":true}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return public.api_error('FORBIDDEN', 'عملية إدارية محمية'); end if;
  update public.idempotency_keys
     set status = 'done', response = coalesce(p_response, '{"ok":true}'::jsonb)
   where key = trim(p_key);
  return public.api_ok(jsonb_build_object('key', trim(p_key), 'status', 'done'));
end $$;

revoke all on function public.complete_idempotent(text, jsonb) from public;
grant execute on function public.complete_idempotent(text, jsonb) to authenticated;

-- ---------- 3) مصفوفة الموافقات executing→completed (§10/§34) ----------
alter table public.approval_requests drop constraint if exists approval_requests_status_check;
alter table public.approval_requests add constraint approval_requests_status_check
  check (status in ('pending','approved','rejected','cancelled','expired','executing','completed'));

alter table public.approval_requests add column if not exists executed_by uuid references public.admin_users(id) on delete set null;
alter table public.approval_requests add column if not exists executed_at timestamptz;

-- تنفيذ نتيجة مباراة عبر موافقة matches.correct_result (مساعد داخلي)
create or replace function public.execute_match_result_approval(
  p_approval_id uuid, p_match_id text, p_request_data jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_home int;
  v_away int;
  v_fixture boolean;
  v_res jsonb;
begin
  if p_match_id is null or nullif(trim(p_match_id), '') is null then
    return public.api_error('VALIDATION_ERROR', 'معرّف المباراة مفقود');
  end if;
  begin
    v_home := (p_request_data->>'home_score')::int;
    v_away := (p_request_data->>'away_score')::int;
    v_fixture := coalesce((p_request_data->>'is_fixture')::boolean, false);
  exception when others then
    return public.api_error('VALIDATION_ERROR', 'نتيجة غير صالحة في بيانات الطلب');
  end;
  if v_home < 0 or v_away < 0 or p_match_id !~ '^[0-9]+$' then
    return public.api_error('VALIDATION_ERROR', 'نتيجة أو معرّف مباراة غير صالح');
  end if;
  v_res := public.score_match_points(p_match_id::int, v_home, v_away, v_fixture);
  if v_res ? 'error' then
    return public.api_error('INTERNAL_ERROR', 'فشل احتساب النتيجة: ' || coalesce(v_res->>'error', ''));
  end if;
  return public.api_ok(jsonb_build_object(
    'match_id', p_match_id, 'home_score', v_home, 'away_score', v_away,
    'scored', v_res->'scored_predictions', 'points', v_res->'points_awarded'
  ));
end $$;

revoke all on function public.execute_match_result_approval(uuid, text, jsonb) from public;

-- ---------- 3) التنفيذ الفعلي للطلبات المعتمدة (Maker → Checker → Execute) ----------
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
begin
  select id into v_me from public.admin_users where profile_id = auth.uid();
  if v_me is null then return public.api_error('NOT_ADMIN', 'هوية المشرف غير موجودة'); end if;

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

-- حالة استرداد الدفعات (إضافة إلى قائمة الحالات القائمة)
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending','success','failed','cancelled','refunded'));

-- ---------- 4) Authorization Check (§9) ----------
create or replace function public.approval_required_for_permission(p_permission text)
returns boolean
language sql immutable set search_path = public as $$
  select exists (
    select 1
    from (values
      ('wallets.adjust'::text), ('points.adjust'), ('matches.correct_result'),
      ('predictions.correct'), ('payments.refund'), ('prizes.approve_redemption'),
      ('security.manage_2fa'), ('maintenance.activate'), ('notifications.send')
    ) t(perm)
    where t.perm = p_permission
  );
$$;

create or replace function public.effective_scope(
  p_permission text, p_resource_type text default null, p_resource_id text default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'super_admin') then
      '{"type":"global"}'::jsonb
    when exists (
      select 1
      from public.admin_users au
      join public.admin_user_roles aur on aur.admin_user_id = au.id
        and (aur.expires_at is null or aur.expires_at > now())
      join public.role_scopes rs on rs.role_id = aur.role_id
      where au.profile_id = auth.uid() and rs.scope_type = 'global'
    ) then '{"type":"global"}'::jsonb
    else coalesce((
      select jsonb_build_object('type', rs.scope_type, 'id', rs.scope_id)
      from public.admin_users au
      join public.admin_user_roles aur on aur.admin_user_id = au.id
        and (aur.expires_at is null or aur.expires_at > now())
      join public.role_scopes rs on rs.role_id = aur.role_id
      where au.profile_id = auth.uid()
      order by (rs.scope_type = 'competition') desc, rs.created_at asc
      limit 1
    ), '{"type":"global"}'::jsonb)
  end;
$$;

create or replace function public.admin_authorization_check(
  p_permission text, p_resource_type text default null, p_resource_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_req_approval boolean;
begin
  if not public.is_admin() then return public.api_error('FORBIDDEN', 'عملية إدارية محمية'); end if;
  v_req_approval := public.approval_required_for_permission(p_permission);
  return public.api_ok(jsonb_build_object(
    'permission', p_permission,
    'allowed', public.has_permission(p_permission),
    'requires_approval', v_req_approval,
    'scope', public.effective_scope(p_permission, p_resource_type, p_resource_id)
  ));
end $$;

revoke all on function public.admin_authorization_check(text, text, text) from public;
grant execute on function public.admin_authorization_check(text, text, text) to authenticated;

-- ============================================================
-- ملاحظة توافق: الدوال القديمة (create_approval_request / review_approval_request /
-- admin_create_match / admin_upsert_fixtures ...) تبقى بروابطها الحالية دون تغيير.
-- الدوال الجديدة تستخدم envelope {success,data,error,meta} وفق العقد.
-- ============================================================