-- ============================================================================
-- 20260925_full_admin_ops.sql
-- التوسعة الإدارية الشاملة: RBAC + المدفوعات + الكوبونات + الجوائز + الدعم
-- + الإشعارات + الإصدارات + CMS + تصحيحات التوقعات + الحلبات + تعديلات المحفظة
-- كل عملية حساسة تمر عبر دالة أمنية تسجل في admin_audit_logs.
-- ============================================================================

-- ============ 1) RBAC — الأدوار ومصفوفة الصلاحيات ============
create table if not exists public.admin_roles (
  role text primary key,
  label_ar text not null,
  read_modules text[] not null default '{}',
  write_modules text[] not null default '{}',
  builtin boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;
drop policy if exists "admin_roles_select_auth" on public.admin_roles;
create policy "admin_roles_select_auth" on public.admin_roles for select to authenticated using (true);
drop policy if exists "admin_roles_write_super" on public.admin_roles;
create policy "admin_roles_write_super" on public.admin_roles for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
);
grant select on public.admin_roles to authenticated, anon;

insert into public.admin_roles (role, label_ar, read_modules, write_modules) values
  ('super_admin', 'مدير عام', array['*'], array['*']),
  ('admin', 'مشرف', array['dashboard','users','matches','prediction_points','predictions','snapshot','arenas','questions','wallet','ledger','payments','store','prizes','partners','coupons','notifications','cms','audit'], array['matches','store','coupons','partners','prizes','wallet','notifications']),
  ('competition_manager', 'مدير المسابقات', array['dashboard','football','matches','match_detail'], array['football','matches','match_detail']),
  ('prediction_manager', 'مدير التوقعات', array['dashboard','matches','predictions','points','snapshot','match_detail'], array['predictions','points','snapshot','match_detail']),
  ('challenge_manager', 'مدير التحديات', array['dashboard','arenas','coach','questions','store'], array['arenas','coach','questions']),
  ('wallet_manager', 'مدير المحفظة', array['dashboard','wallet','ledger','payments'], array['wallet','ledger','payments']),
  ('store_manager', 'مدير المتجر', array['dashboard','store','prizes','coupons','partners','wallet'], array['store','prizes','coupons']),
  ('partner_manager', 'مدير الشركاء', array['dashboard','partners','coupons','store'], array['partners','coupons']),
  ('support_agent', 'موظف الدعم', array['dashboard','users','support'], array['users','support']),
  ('content_manager', 'مدير المحتوى', array['dashboard','cms','notifications','search','versions','maintenance'], array['cms','notifications','search']),
  ('analyst', 'محلل', array['dashboard','users','reports','predictions','wallet','ledger','store','prizes','support'], array['{}'])
on conflict (role) do update set
  label_ar = excluded.label_ar,
  read_modules = excluded.read_modules,
  write_modules = excluded.write_modules;

-- مدقق صلاحيات عام يستخدم في سياسات RLS والدوال
create or replace function public.has_admin_module(p_module text, p_write boolean default false)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.admin_roles ar on ar.role = pr.role
    where pr.id = auth.uid()
      and ('*' = any(case when p_write then ar.write_modules else ar.read_modules end)
           or p_module = any(case when p_write then ar.write_modules else ar.read_modules end))
  );
$$;

-- مدقق سريع لقائمة أدوار
create or replace function public.is_admin_role(p_roles text[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any(p_roles));
$$;

-- تسجيل تدقيق موحّد (يستدعى من الدوال الحساسة فقط)
create or replace function public.log_admin_action(
  p_action text,
  p_resource text,
  p_resource_id text default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.admin_audit_logs (actor_id, action, resource, resource_id, reason, metadata, correlation_id)
  values (auth.uid(), p_action, p_resource, p_resource_id, p_reason, p_metadata, gen_random_uuid()::text)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.log_admin_action(text, text, text, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, text, text, jsonb) to authenticated;

-- توسيع set_user_role ليسمح بكل أدوار RBAC (للسوبر أدمن فقط)
create or replace function public.set_user_role(p_target_id uuid, p_new_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_caller_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'super_admin' then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_new_role <> 'user'
     and not exists (select 1 from public.admin_roles where role = p_new_role) then
    return jsonb_build_object('error', 'INVALID_ROLE');
  end if;
  if p_target_id = auth.uid() then return jsonb_build_object('error', 'SELF_ROLE'); end if;

  update public.profiles set role = p_new_role where id = p_target_id;
  perform public.log_admin_action('set_role', 'profiles', p_target_id::text, 'role -> ' || p_new_role);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- تحرير مصفوفة صلاحيات دور (سوبر أدمن فقط)
create or replace function public.admin_edit_role_matrix(p_role text, p_read text[], p_write text[], p_label_ar text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_caller_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'super_admin' then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  update public.admin_roles
     set read_modules = coalesce(p_read, read_modules),
         write_modules = coalesce(p_write, write_modules),
         label_ar = coalesce(nullif(trim(coalesce(p_label_ar, '')), ''), label_ar)
   where role = p_role;
  if not found then return jsonb_build_object('error', 'ROLE_NOT_FOUND'); end if;
  perform public.log_admin_action('edit_role_matrix', 'admin_roles', p_role);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_edit_role_matrix(text, text[], text[], text) from public;
grant execute on function public.admin_edit_role_matrix(text, text[], text[], text) to authenticated;

-- تحديث دوال المباريات لتشمل أدوار الإدارة الموسعة
create or replace function public.admin_create_match(
  p_league text, p_home text, p_away text, p_home_short text, p_away_short text,
  p_time text, p_points int, p_featured boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match public.admin_matches%rowtype;
begin
  if not public.has_admin_module('matches', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if nullif(trim(coalesce(p_home, '')), '') is null or nullif(trim(coalesce(p_away, '')), '') is null then
    return jsonb_build_object('error', 'MISSING_TEAMS');
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
    'upcoming', current_date, auth.uid()
  )
  returning * into v_match;

  perform public.log_admin_action('create_match', 'admin_matches', v_match.id::text, v_match.home || ' vs ' || v_match.away);
  return jsonb_build_object('ok', true, 'id', v_match.id, 'code', v_match.id);
end $$;

create or replace function public.admin_delete_match(p_match_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.admin_matches;
begin
  if not public.has_admin_module('matches', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  select * into v_row from public.admin_matches where id = p_match_id;
  delete from public.admin_matches where id = p_match_id;
  if v_row.id is not null then
    perform public.log_admin_action('delete_match', 'admin_matches', p_match_id::text, v_row.home || ' vs ' || v_row.away);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- توسيع صلاحية اعتماد النتائج لأدوار التوقعات، وإغلاق ثغرة الاستدعاء غير المخوّل
create or replace function public.score_match_points(
  p_match_id int,
  p_home int,
  p_away int,
  p_is_fixture boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_scored int := 0;
  v_points bigint := 0;
  v_arena_scored int := 0;
  v_arena_points bigint := 0;
  v_total int;
  v_exact_count int;
  v_rare boolean;
  v_arena_total int;
  v_arena_exact int;
  v_arena_rare boolean;
  v_rec record;
  v_pts int;
begin
  if not public.has_admin_module('matches', true)
     and not public.has_admin_module('prediction_points', true)
     and not public.has_admin_module('points', true) then
    raise exception 'FORBIDDEN';
  end if;

  insert into public.match_final_scores (match_id, home_goals, away_goals, is_fixture, scored_at)
  values (p_match_id, p_home, p_away, p_is_fixture, now())
  on conflict (match_id) do update
    set home_goals = excluded.home_goals,
        away_goals = excluded.away_goals,
        is_fixture = excluded.is_fixture,
        scored_at = now();

  select count(*) into v_total
  from public.predictions where match_id = p_match_id;

  select count(*) into v_exact_count
  from public.predictions
  where match_id = p_match_id and home_score = p_home and away_score = p_away;

  v_rare := v_total > 0 and (v_exact_count::numeric / v_total) < 0.10;

  for v_rec in
    select * from public.predictions
    where match_id = p_match_id and scored = false
  loop
    v_pts := 0;

    if v_rec.home_score = p_home and v_rec.away_score = p_away then
      v_pts := (case when p_is_fixture then 5 else 3 end) + (case when v_rare then 1 else 0 end);
    else
      if (v_rec.home_score > v_rec.away_score and p_home > p_away)
         or (v_rec.home_score = v_rec.away_score and p_home = p_away)
         or (v_rec.home_score < v_rec.away_score and p_home < p_away) then
        v_pts := case when p_is_fixture then 2 else 1 end;
      end if;
    end if;

    update public.predictions
      set points_awarded = v_pts, scored = true, updated_at = now()
      where id = v_rec.id;

    if v_pts > 0 then
      update public.profiles set user_points = user_points + v_pts where id = v_rec.user_id;
    end if;

    v_scored := v_scored + 1;
    v_points := v_points + v_pts;
  end loop;

  select count(*) into v_arena_total
  from public.arena_predictions where match_id = p_match_id;

  select count(*) into v_arena_exact
  from public.arena_predictions
  where match_id = p_match_id and home_score = p_home and away_score = p_away;

  v_arena_rare := v_arena_total > 0 and (v_arena_exact::numeric / v_arena_total) < 0.10;

  for v_rec in
    select * from public.arena_predictions
    where match_id = p_match_id and scored = false
  loop
    v_pts := 0;

    if v_rec.home_score = p_home and v_rec.away_score = p_away then
      v_pts := (case when p_is_fixture then 5 else 3 end) + (case when v_arena_rare then 1 else 0 end);
    else
      if (v_rec.home_score > v_rec.away_score and p_home > p_away)
         or (v_rec.home_score = v_rec.away_score and p_home = p_away)
         or (v_rec.home_score < v_rec.away_score and p_home < p_away) then
        v_pts := case when p_is_fixture then 2 else 1 end;
      end if;
    end if;

    update public.arena_predictions
      set points_awarded = v_pts, scored = true, updated_at = now()
      where id = v_rec.id;

    v_arena_scored := v_arena_scored + 1;
    v_arena_points := v_arena_points + v_pts;
  end loop;

  perform public.log_admin_action(
    'score_match', 'matches', p_match_id::text,
    format('%s-%s (fixture=%s): %s pred (%s pts) + %s arena (%s pts)', p_home, p_away, p_is_fixture, v_scored, v_points, v_arena_scored, v_arena_points)
  );

  return jsonb_build_object(
    'match_id', p_match_id,
    'scored_predictions', v_scored,
    'points_awarded', v_points,
    'arena_scored', v_arena_scored,
    'arena_points_awarded', v_arena_points
  );
end;
$$;

revoke all on function public.score_match_points(int, int, int, boolean) from public;
grant execute on function public.score_match_points(int, int, int, boolean) to authenticated;

-- حذف/إعادة احتساب كامل لمباراة (تصحيح النتيجة بعد اعتمادها) — تسجيل تدقيق
create or replace function public.admin_rescore_match(p_match_id int, p_home int, p_away int, p_is_fixture boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rec record;
begin
  if not (public.has_admin_module('match_detail', true) or public.has_admin_module('points', true)) then
    return jsonb_build_object('error', 'FORBIDDEN');
  end if;
  -- سحب النقاط الممنوحة سابقاً
  for v_rec in
    select * from public.predictions where match_id = p_match_id and scored = true and points_awarded > 0
  loop
    update public.profiles set user_points = greatest(user_points - v_rec.points_awarded, 0) where id = v_rec.user_id;
  end loop;
  update public.predictions set points_awarded = 0, scored = false where match_id = p_match_id;

  for v_rec in
    select * from public.arena_predictions where match_id = p_match_id and scored = true and points_awarded > 0
  loop
    null; -- نقاط الحلبات لا تلمس الترتيب العام
  end loop;
  update public.arena_predictions set points_awarded = 0, scored = false where match_id = p_match_id;

  perform public.log_admin_action('rescore_match', 'matches', p_match_id::text,
    format('old score replaced -> new %s-%s', p_home, p_away));

  return public.score_match_points(p_match_id, p_home, p_away, p_is_fixture);
end $$;

revoke all on function public.admin_rescore_match(int, int, int, boolean) from public;
grant execute on function public.admin_rescore_match(int, int, int, boolean) to authenticated;

-- سياسات admin_matches الموسعة
drop policy if exists "adm_insert" on public.admin_matches;
create policy "adm_insert" on public.admin_matches for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
  or public.has_admin_module('matches', true)
);
drop policy if exists "adm_update" on public.admin_matches;
create policy "adm_update" on public.admin_matches for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
  or public.has_admin_module('matches', true)
);
drop policy if exists "adm_delete" on public.admin_matches;
create policy "adm_delete" on public.admin_matches for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
  or public.has_admin_module('matches', true)
);

-- إتاحة قراءة الحلبات لكل الأدوار الإدارية (شاشة إدارة الحلبات أ13)
drop policy if exists "arenas_read_admin" on public.arenas;
create policy "arenas_read_admin" on public.arenas for select to authenticated using (
  public.has_admin_module('arenas', false)
);
drop policy if exists "am_read_admin" on public.arena_members;
create policy "am_read_admin" on public.arena_members for select to authenticated using (
  public.has_admin_module('arenas', false)
);
drop policy if exists "ap_read_admin" on public.arena_predictions;
create policy "ap_read_admin" on public.arena_predictions for select to authenticated using (
  public.has_admin_module('arenas', false)
);

-- ============ 2) المدفوعات ============
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_name text not null,
  bamba_amount int not null check (bamba_amount > 0),
  price numeric(12,2) not null check (price >= 0),
  currency text not null default 'SAR',
  method text not null default 'تحويل محلي',
  status text not null default 'pending' check (status in ('pending','success','failed','cancelled')),
  proof_url text,
  reference_no text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_user_idx on public.payments (user_id);

alter table public.payments enable row level security;
drop policy if exists "payments_read_own" on public.payments;
create policy "payments_read_own" on public.payments for select to authenticated using (user_id = auth.uid());
drop policy if exists "payments_read_admin" on public.payments;
create policy "payments_read_admin" on public.payments for select to authenticated using (public.has_admin_module('payments', false));
drop policy if exists "payments_write_admin" on public.payments;
create policy "payments_write_admin" on public.payments for update to authenticated using (public.has_admin_module('payments', true));

grant select on public.payments to authenticated;

-- مراجعة الدفع: قبول/رفض/إلغاء — القبول يضيف البمبات عبر سجل محفظة Idempotent
create or replace function public.admin_payment_review(p_payment_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payments%rowtype;
  v_balance int;
  v_before int;
  v_idem text;
begin
  if not public.has_admin_module('payments', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_status not in ('success','failed','cancelled') then return jsonb_build_object('error', 'INVALID_STATUS'); end if;

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

-- ============ 3) الكوبونات ============
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.store_partners(id) on delete set null,
  discount int not null check (discount between 1 and 100),
  price_bamba int not null default 0 check (price_bamba >= 0),
  quantity int not null default 1 check (quantity >= 0),
  codes text[] not null default '{}',
  expires_at timestamptz,
  branches text[] not null default '{}',
  terms text,
  status text not null default 'available' check (status in ('available','redeemed','used','expired')),
  redeemed_count int not null default 0,
  used_count int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;
drop policy if exists "coupons_read_all" on public.coupons;
create policy "coupons_read_all" on public.coupons for select to authenticated using (true);
drop policy if exists "coupons_write_admin" on public.coupons;
create policy "coupons_write_admin" on public.coupons for insert to authenticated with check (public.has_admin_module('coupons', true));
create policy "coupons_update_admin" on public.coupons for update to authenticated using (public.has_admin_module('coupons', true));
grant select on public.coupons to authenticated, anon;
grant insert, update on public.coupons to authenticated;

-- ============ 4) الجوائز + مطالبات التتبع ============
create table if not exists public.prizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_bamba int not null check (price_bamba > 0),
  stock int not null default 1 check (stock >= 0),
  claim_conditions text,
  expires_at timestamptz,
  kind text not null default 'product' check (kind in ('product','digital','voucher')),
  partner_id uuid references public.store_partners(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prize_claims (
  id uuid primary key default gen_random_uuid(),
  prize_id uuid not null references public.prizes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','preparing','ready','delivered','completed','rejected')),
  note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists prize_claims_status_idx on public.prize_claims (status);

alter table public.prizes enable row level security;
alter table public.prize_claims enable row level security;
drop policy if exists "prizes_read_all" on public.prizes;
create policy "prizes_read_all" on public.prizes for select to authenticated using (true);
drop policy if exists "prizes_write_admin" on public.prizes;
create policy "prizes_write_admin" on public.prizes for insert to authenticated with check (public.has_admin_module('prizes', true));
create policy "prizes_update_admin" on public.prizes for update to authenticated using (public.has_admin_module('prizes', true));
drop policy if exists "prize_claims_read_own" on public.prize_claims;
create policy "prize_claims_read_own" on public.prize_claims for select to authenticated using (user_id = auth.uid());
drop policy if exists "prize_claims_read_admin" on public.prize_claims;
create policy "prize_claims_read_admin" on public.prize_claims for select to authenticated using (public.has_admin_module('prizes', false));
drop policy if exists "prize_claims_update_admin" on public.prize_claims;
create policy "prize_claims_update_admin" on public.prize_claims for update to authenticated using (public.has_admin_module('prizes', true));

grant select on public.prizes to authenticated, anon;
grant insert, update on public.prizes to authenticated;
grant select on public.prize_claims to authenticated;

-- تحديث حالة طلب جائزة + إعادة المخزون عند الرفض
create or replace function public.admin_prize_update(p_claim_id uuid, p_status text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_claim public.prize_claims%rowtype;
begin
  if not public.has_admin_module('prizes', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_status not in ('preparing','ready','delivered','completed','rejected') then
    return jsonb_build_object('error', 'INVALID_STATUS');
  end if;
  select * into v_claim from public.prize_claims where id = p_claim_id for update;
  if v_claim.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;

  if p_status = 'rejected' and v_claim.status <> 'rejected' then
    update public.prizes set stock = stock + 1 where id = v_claim.prize_id;
  end if;

  update public.prize_claims
     set status = p_status, note = coalesce(p_note, note), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_claim_id;

  perform public.log_admin_action('prize_status', 'prize_claims', p_claim_id::text,
    v_claim.status || ' -> ' || p_status || coalesce(' — ' || p_note, ''));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_prize_update(uuid, text, text) from public;
grant execute on function public.admin_prize_update(uuid, text, text) to authenticated;

-- ============ 5) تذاكر الدعم ============
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  category text,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'new' check (status in ('new','in_progress','waiting_user','resolved','closed')),
  assignee_id uuid references public.profiles(id) on delete set null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx on public.support_tickets (status, priority);

alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
drop policy if exists "support_read_own" on public.support_tickets;
create policy "support_read_own" on public.support_tickets for select to authenticated using (user_id = auth.uid());
drop policy if exists "support_read_admin" on public.support_tickets;
create policy "support_read_admin" on public.support_tickets for select to authenticated using (public.has_admin_module('support', false));
drop policy if exists "support_insert_own" on public.support_tickets;
create policy "support_insert_own" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "support_update_admin" on public.support_tickets;
create policy "support_update_admin" on public.support_tickets for update to authenticated using (public.has_admin_module('support', true));
drop policy if exists "ticket_msg_read" on public.ticket_messages;
create policy "ticket_msg_read" on public.ticket_messages for select to authenticated using (
  exists (select 1 from public.support_tickets t where t.id = public.ticket_messages.ticket_id and (t.user_id = auth.uid() or public.has_admin_module('support', false)))
);
drop policy if exists "ticket_msg_insert" on public.ticket_messages;
create policy "ticket_msg_insert" on public.ticket_messages for insert to authenticated with check (
  exists (select 1 from public.support_tickets t where t.id = public.ticket_messages.ticket_id and (t.user_id = auth.uid() or public.has_admin_module('support', true)))
);

grant select, insert on public.support_tickets to authenticated;
grant select, insert on public.ticket_messages to authenticated;

create or replace function public.admin_support_update(p_ticket_id uuid, p_status text, p_priority text, p_assignee_id uuid, p_msg_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev public.support_tickets%rowtype;
begin
  if not public.has_admin_module('support', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  select * into v_prev from public.support_tickets where id = p_ticket_id for update;
  if v_prev.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;

  update public.support_tickets
     set status = coalesce(p_status, status),
         priority = coalesce(p_priority, priority),
         assignee_id = coalesce(p_assignee_id, assignee_id),
         first_response_at = case when first_response_at is null and p_status is not null and p_status <> 'new'
                                  then now() else first_response_at end,
         resolved_at = case when p_status = 'resolved' then now() else resolved_at end
   where id = p_ticket_id;

  if p_msg_body is not null and trim(p_msg_body) <> '' then
    insert into public.ticket_messages (ticket_id, author_id, body, is_internal) values (p_ticket_id, auth.uid(), trim(p_msg_body), true);
  end if;

  perform public.log_admin_action('support_update', 'support_tickets', p_ticket_id::text,
    v_prev.status || ' -> ' || coalesce(p_status, v_prev.status));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_support_update(uuid, text, text, uuid, text) from public;
grant execute on function public.admin_support_update(uuid, text, text, uuid, text) to authenticated;

-- ============ 6) إشعارات الإدارة ============
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  audience jsonb not null default '{"all": true}'::jsonb,
  page_link text,
  send_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sent','failed')),
  sent_count int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admin_notifications enable row level security;
drop policy if exists "notif_read_admin" on public.admin_notifications;
create policy "notif_read_admin" on public.admin_notifications for select to authenticated using (public.has_admin_module('notifications', false));
drop policy if exists "notif_write_admin" on public.admin_notifications;
create policy "notif_write_admin" on public.admin_notifications for insert to authenticated with check (public.has_admin_module('notifications', true));
create policy "notif_update_admin" on public.admin_notifications for update to authenticated using (public.has_admin_module('notifications', true));
grant select, insert, update on public.admin_notifications to authenticated;

-- ============ 7) إصدارات التطبيق ============
create table if not exists public.app_versions (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('android','ios')),
  version text not null,
  min_supported text,
  mandatory boolean not null default false,
  security boolean not null default false,
  whats_new text,
  store_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (platform, version)
);

alter table public.app_versions enable row level security;
drop policy if exists "app_versions_read_auth" on public.app_versions;
create policy "app_versions_read_auth" on public.app_versions for select to authenticated using (true);
drop policy if exists "app_versions_write_admin" on public.app_versions;
create policy "app_versions_write_admin" on public.app_versions for insert to authenticated with check (public.has_admin_module('versions', true));
create policy "app_versions_update_admin" on public.app_versions for update to authenticated using (public.has_admin_module('versions', true));
grant select on public.app_versions to authenticated, anon;
grant insert, update on public.app_versions to authenticated;

-- ============ 8) إدارة المحتوى CMS ============
create table if not exists public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  section text not null default 'other' check (section in ('faq','about','terms','privacy','changelog','maintenance','empty_states','ads','banners','other')),
  title_ar text not null,
  title_en text,
  body_ar text not null,
  body_en text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.cms_pages enable row level security;
drop policy if exists "cms_read_auth" on public.cms_pages;
create policy "cms_read_auth" on public.cms_pages for select to authenticated using (true);
drop policy if exists "cms_write_admin" on public.cms_pages;
create policy "cms_write_admin" on public.cms_pages for insert to authenticated with check (public.has_admin_module('cms', true));
create policy "cms_update_admin" on public.cms_pages for update to authenticated using (public.has_admin_module('cms', true));
grant select on public.cms_pages to authenticated, anon;
grant insert, update on public.cms_pages to authenticated;

insert into public.cms_pages (slug, section, title_ar, body_ar, title_en, body_en) values
  ('about', 'about', 'عن بمبا', 'منصة توقعات رياضية تجمع الجماهير حول أنديتها وبطولاتها المفضلة، مع نظام نقاط وبمبات ومتجر وتحديات.', 'About BMBA', 'Footy predictions platform that brings fans together around their favourite clubs.'),
  ('terms', 'terms', 'الشروط والأحكام', 'قيد التحديث من فريق الإدارة.', 'Terms', 'Pending update by the admin team.'),
  ('privacy', 'privacy', 'سياسة الخصوصية', 'قيد التحديث من فريق الإدارة.', 'Privacy Policy', 'Pending update by the admin team.'),
  ('faq', 'faq', 'الأسئلة الشائعة', 'اجمع أعلى عدد نقاط من التوقعات الصحيحة لتصعد في الترتيب.', 'FAQ', 'Earn points from correct predictions to climb the leaderboard.')
on conflict (slug) do update set
  section = excluded.section,
  title_ar = excluded.title_ar,
  body_ar = excluded.body_ar;

-- ============ 9) تصحيحات التوقعات (مسار موثق) ============
create table if not exists public.prediction_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id int not null,
  request_type text not null check (request_type in ('rescore_match','manual_fix')),
  reason text not null,
  old_snapshot jsonb default '{}'::jsonb,
  new_snapshot jsonb default '{}'::jsonb,
  status text not null default 'requested' check (status in ('requested','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.prediction_corrections enable row level security;
drop policy if exists "corr_read_admin" on public.prediction_corrections;
create policy "corr_read_admin" on public.prediction_corrections for select to authenticated using (public.has_admin_module('predictions', false));
drop policy if exists "corr_insert_admin" on public.prediction_corrections;
create policy "corr_insert_admin" on public.prediction_corrections for insert to authenticated with check (public.has_admin_module('predictions', true));
drop policy if exists "corr_update_admin" on public.prediction_corrections;
create policy "corr_update_admin" on public.prediction_corrections for update to authenticated using (public.has_admin_module('predictions', true));
grant select, insert, update on public.prediction_corrections to authenticated;

-- تصحيحات ترتيب الحلبات الموثقة (أ13)
create table if not exists public.arena_corrections (
  id uuid primary key default gen_random_uuid(),
  arena_id uuid not null references public.arenas(id) on delete cascade,
  reason text not null,
  resolution text,
  status text not null default 'open' check (status in ('open','applied','rejected')),
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.arena_corrections enable row level security;
drop policy if exists "arena_corr_read_admin" on public.arena_corrections;
create policy "arena_corr_read_admin" on public.arena_corrections for select to authenticated using (public.has_admin_module('arenas', false));
drop policy if exists "arena_corr_write_admin" on public.arena_corrections;
create policy "arena_corr_write_admin" on public.arena_corrections for insert to authenticated with check (public.has_admin_module('arenas', true));
create policy "arena_corr_update_admin" on public.arena_corrections for update to authenticated using (public.has_admin_module('arenas', true));
grant select, insert, update on public.arena_corrections to authenticated;

-- ============ 10) تعديلات المحفظة/النقاط اليدوية (مسار موثق) ============
create table if not exists public.ledger_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('wallet','points')),
  amount int not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.ledger_adjustments enable row level security;
drop policy if exists "ledger_adj_read_own" on public.ledger_adjustments;
create policy "ledger_adj_read_own" on public.ledger_adjustments for select to authenticated using (user_id = auth.uid());
drop policy if exists "ledger_adj_read_admin" on public.ledger_adjustments;
create policy "ledger_adj_read_admin" on public.ledger_adjustments for select to authenticated using (public.has_admin_module('wallet', false));
drop policy if exists "ledger_adj_insert_admin" on public.ledger_adjustments;
create policy "ledger_adj_insert_admin" on public.ledger_adjustments for insert to authenticated with check (public.has_admin_module('wallet', true));
drop policy if exists "ledger_adj_update_admin" on public.ledger_adjustments;
create policy "ledger_adj_update_admin" on public.ledger_adjustments for update to authenticated using (public.has_admin_module('wallet', true));
grant select, insert, update on public.ledger_adjustments to authenticated;

create or replace function public.admin_ledger_review(p_adj_id uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_adj public.ledger_adjustments%rowtype;
  v_balance int;
  v_before int;
  v_idem text;
begin
  if not public.has_admin_module('wallet', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_status not in ('approved','rejected') then return jsonb_build_object('error', 'INVALID_STATUS'); end if;

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

-- توسيع قراءة نقط ومحافظ أدوار الإدارة الموسعة
drop policy if exists "points_ledger_read_admin" on public.points_ledger;
create policy "points_ledger_read_admin" on public.points_ledger
  for select to authenticated using (public.has_admin_module('ledger', false) or public.has_admin_module('points', false));

drop policy if exists "wallet_transactions_read_admin" on public.wallet_transactions;
create policy "wallet_transactions_read_admin" on public.wallet_transactions
  for select to authenticated using (public.has_admin_module('ledger', false) or public.has_admin_module('wallet', false));

-- توسيع قراءة ملفات الأعضاء لموظفي الدعم والمحللين
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select to authenticated using (
    public.has_admin_module('users', false)
    or public.has_admin_module('support', false)
  );

-- إعدادات النظام تبقى قراءة للسوبر أدمن فقط (كتابة عبر اللوحة)
insert into public.system_settings (key, value) values
  ('bamba_daily_limit', '500'::jsonb),
  ('referral_bonus', '100'::jsonb),
  ('arena_max_join', '2'::jsonb),
  ('arena_max_own', '1'::jsonb),
  ('coach_budget', '25000'::jsonb),
  ('coach_max_per_team', '3'::jsonb),
  ('coach_squad_size', '14'::jsonb),
  ('quiz_reward_per_question', '5'::jsonb),
  ('prediction_close_minutes_before', '30'::jsonb)
on conflict (key) do nothing;