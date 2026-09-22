/*
# تحديث شامل — الحلبات + الأسئلة الحديثة + مباريات اليوم + ترقية المشرفين

1. `arenas` + `arena_members` + `arena_predictions` — حلبات مصغّرة من نظام التوقعات:
   - من ينشئ الحلبة هو «المسؤول» (owner) ويظهر بشارة داخل الحلبة.
   - كل حلبة تعرض مباريات التوقع نفسها (مفلترة بدوريتها إن اختيرت).
   - النقاط تُحسب داخل الحلبة (نفس قواعد النظام العام) وتظهر في ترتيب خاص.
2. `admin_matches` — مباريات ديناميكية ينشئها المشرف/السوبر أدمن وتظهر فوراً في صفحة التوقعات.
3. `set_user_role` — السوبر أدمن يرقّي أي مشترك إلى «مشرف» (صلاحيات: المباريات + المتجر).
4. توسيع بنك الأسئلة بأسئلة حديثة (مواسم 2023-2026، الخمس الكبرى، الجوائز العالمية).
5. `score_match_points` الموسّعة — اعتماد نتيجة المباراة يحتسب نقاط التوقع العام + كل الحلبات معاً.
*/

-- ============ 1) جداول الحلبات ============
create table if not exists public.arenas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'أصدقائي',
  league_filter text not null default 'كل البطولات',
  code text not null unique,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.arena_members (
  id uuid primary key default gen_random_uuid(),
  arena_id uuid not null references public.arenas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (arena_id, user_id)
);

create table if not exists public.arena_predictions (
  id uuid primary key default gen_random_uuid(),
  arena_id uuid not null references public.arenas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id int not null,
  home_score int not null check (home_score between 0 and 99),
  away_score int not null check (away_score between 0 and 99),
  points_awarded int not null default 0,
  scored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (arena_id, user_id, match_id)
);

create index if not exists idx_arena_members_user on public.arena_members (user_id);
create index if not exists idx_arena_preds_match on public.arena_predictions (match_id);
create index if not exists idx_arena_preds_arena on public.arena_predictions (arena_id, scored);

alter table public.arenas enable row level security;
alter table public.arena_members enable row level security;
alter table public.arena_predictions enable row level security;

drop policy if exists "arena_select" on public.arenas;
create policy "arena_select" on public.arenas for select using (
  owner_id = auth.uid()
  or exists (select 1 from public.arena_members m where m.arena_id = public.arenas.id and m.user_id = auth.uid())
);
drop policy if exists "arena_insert" on public.arenas;
create policy "arena_insert" on public.arenas for insert with check (owner_id = auth.uid());
drop policy if exists "arena_update" on public.arenas;
create policy "arena_update" on public.arenas for update using (owner_id = auth.uid());
drop policy if exists "arena_delete" on public.arenas;
create policy "arena_delete" on public.arenas for delete using (owner_id = auth.uid());

drop policy if exists "am_select" on public.arena_members;
create policy "am_select" on public.arena_members for select using (
  exists (select 1 from public.arena_members me where me.arena_id = public.arena_members.arena_id and me.user_id = auth.uid())
);
drop policy if exists "am_insert" on public.arena_members;
create policy "am_insert" on public.arena_members for insert with check (user_id = auth.uid());
drop policy if exists "am_update" on public.arena_members;
create policy "am_update" on public.arena_members for update using (user_id = auth.uid());
drop policy if exists "am_delete" on public.arena_members;
create policy "am_delete" on public.arena_members for delete using (user_id = auth.uid());

drop policy if exists "ap_select" on public.arena_predictions;
create policy "ap_select" on public.arena_predictions for select using (
  exists (select 1 from public.arena_members m where m.arena_id = public.arena_predictions.arena_id and m.user_id = auth.uid())
);
drop policy if exists "ap_insert" on public.arena_predictions;
create policy "ap_insert" on public.arena_predictions for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.arena_members m where m.arena_id = public.arena_predictions.arena_id and m.user_id = auth.uid())
);
drop policy if exists "ap_update" on public.arena_predictions;
create policy "ap_update" on public.arena_predictions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ap_delete" on public.arena_predictions;
create policy "ap_delete" on public.arena_predictions for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.arenas, public.arena_members, public.arena_predictions to authenticated;

-- ============ 2) دوال الحلبات ============
-- إنشاء حلبة: المالك = منشئها، كود فريد من 4 أرقام، عضوية واحدة لكل عضو.
create or replace function public.create_arena(p_name text, p_category text, p_league text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_code text;
begin
  perform 1 from public.arenas where owner_id = auth.uid();
  if found then return jsonb_build_object('error', 'ONE_ARENA_ONLY'); end if;

  loop
    v_code := lpad(floor(1000 + random() * 9000)::int::text, 4, '0');
    exit when not exists (select 1 from public.arenas where code = v_code);
  end loop;

  insert into public.arenas (name, category, league_filter, code, owner_id)
  values (
    coalesce(nullif(trim(coalesce(p_name, '')), ''), coalesce(p_category, 'أصدقائي') || ' — ' || coalesce(p_league, 'كل البطولات')),
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'أصدقائي'),
    coalesce(nullif(trim(coalesce(p_league, '')), ''), 'كل البطولات'),
    v_code,
    auth.uid()
  )
  returning id into v_id;

  insert into public.arena_members (arena_id, user_id) values (v_id, auth.uid());

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'name', p_name);
end $$;

-- الانضمام بحلبة عبر الكود (حد أقصى: عضوية في حلبتين).
create or replace function public.join_arena(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_arena public.arenas%rowtype;
  v_member_count int;
begin
  select * into v_arena from public.arenas where code = trim(coalesce(p_code, ''));
  if v_arena.id is null then return jsonb_build_object('error', 'NOT_FOUND'); end if;
  if v_arena.owner_id = auth.uid() then return jsonb_build_object('error', 'OWN_ARENA'); end if;

  perform 1 from public.arena_members where arena_id = v_arena.id and user_id = auth.uid();
  if found then return jsonb_build_object('error', 'ALREADY_MEMBER'); end if;

  select count(*) into v_member_count from public.arena_members where user_id = auth.uid();
  if v_member_count >= 2 then return jsonb_build_object('error', 'MEMBER_LIMIT'); end if;

  insert into public.arena_members (arena_id, user_id) values (v_arena.id, auth.uid());
  return jsonb_build_object('ok', true, 'id', v_arena.id, 'code', v_arena.code);
end $$;

-- حلباتي (التي أنشأتها أو انضممت إليها) مع عدد الأعضاء واسم المسؤول.
create or replace function public.get_my_arenas()
returns table(id uuid, name text, category text, league_filter text, code text, owner_id uuid, owner_username text, members bigint, is_owner boolean, created_at timestamptz)
language sql security definer set search_path = public as $$
  select a.id, a.name, a.category, a.league_filter, a.code, a.owner_id,
         coalesce(p.username, 'مسؤول الحلبة') as owner_username,
         (select count(*) from public.arena_members m where m.arena_id = a.id) as members,
         (a.owner_id = auth.uid()) as is_owner,
         a.created_at
  from public.arenas a
  join public.arena_members me on me.arena_id = a.id
  left join public.profiles p on p.id = a.owner_id
  where me.user_id = auth.uid()
  order by a.created_at desc;
$$;

-- حفظ توقع داخل الحلبة (يدخل فقط الأعضاء، وللمباريات غير المعتمدة).
create or replace function public.submit_arena_prediction(p_arena_id uuid, p_match_id int, p_home int, p_away int)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_home < 0 or p_home > 99 or p_away < 0 or p_away > 99 then
    return jsonb_build_object('error', 'INVALID_SCORE');
  end if;
  perform 1 from public.arena_members where arena_id = p_arena_id and user_id = auth.uid();
  if not found then return jsonb_build_object('error', 'NOT_MEMBER'); end if;
  perform 1 from public.match_final_scores where match_id = p_match_id;
  if found then return jsonb_build_object('error', 'MATCH_SCORED'); end if;

  insert into public.arena_predictions (arena_id, user_id, match_id, home_score, away_score)
  values (p_arena_id, auth.uid(), p_match_id, p_home, p_away)
  on conflict (arena_id, user_id, match_id)
  do update set home_score = excluded.home_score, away_score = excluded.away_score,
                points_awarded = 0, scored = false, updated_at = now();

  return jsonb_build_object('ok', true);
end $$;

-- توقعاتي داخل الحلبة.
create or replace function public.get_my_arena_predictions(p_arena_id uuid)
returns table(match_id int, home_score int, away_score int, scored boolean, points_awarded int)
language sql security definer set search_path = public as $$
  select ap.match_id, ap.home_score, ap.away_score, ap.scored, ap.points_awarded
  from public.arena_predictions ap
  where ap.arena_id = p_arena_id and ap.user_id = auth.uid();
$$;

-- ترتيب الحلبة: كل عضو مع عدد توقعاته ومجموع نقاطه.
create or replace function public.get_arena_leaderboard(p_arena_id uuid)
returns table(user_id uuid, username text, predicted bigint, points bigint)
language sql security definer set search_path = public as $$
  select m.user_id,
         coalesce(p.username, 'مشترك') as username,
         (select count(*) from public.arena_predictions ap where ap.arena_id = p_arena_id and ap.user_id = m.user_id) as predicted,
         coalesce((select sum(ap.points_awarded) from public.arena_predictions ap where ap.arena_id = p_arena_id and ap.user_id = m.user_id), 0) as points
  from public.arena_members m
  left join public.profiles p on p.id = m.user_id
  where m.arena_id = p_arena_id
  order by points desc, predicted desc;
$$;

revoke all on function public.create_arena(text, text, text) from public;
grant execute on function public.create_arena(text, text, text) to authenticated;
revoke all on function public.join_arena(text) from public;
grant execute on function public.join_arena(text) to authenticated;
revoke all on function public.get_my_arenas() from public;
grant execute on function public.get_my_arenas() to authenticated;
revoke all on function public.submit_arena_prediction(uuid, int, int, int) from public;
grant execute on function public.submit_arena_prediction(uuid, int, int, int) to authenticated;
revoke all on function public.get_my_arena_predictions(uuid) from public;
grant execute on function public.get_my_arena_predictions(uuid) to authenticated;
revoke all on function public.get_arena_leaderboard(uuid) from public;
grant execute on function public.get_arena_leaderboard(uuid) to authenticated;

-- ============ 3) احتساب نقاط الحلبات عند اعتماد النتيجة (نفس قواعد النظام العام) ============
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

  -- "النتيجة النادرة": توقعها أقل من 10% من أعضاء المباراة
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

  -- ===== نقاط الحلبات (داخل كل حلبة فقط — لا تُضاف للترتيب العام) =====
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

-- ============ 4) مباريات اليوم الديناميكية (ينشئها المشرف/السوبر أدمن) ============
create table if not exists public.admin_matches (
  id bigint generated by default as identity primary key,
  league text not null,
  home text not null,
  away text not null,
  home_short text not null,
  away_short text not null,
  time text not null default '21:00',
  points int not null default 3,
  featured boolean not null default false,
  status text not null default 'upcoming',
  match_date date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- أرقام المباريات الديناميكية تبدأ من 1000 حتى لا تتعارض مع المباريات الثابتة (1-7)
alter sequence public.admin_matches_id_seq start with 1000;
select setval('admin_matches_id_seq', 999, true);

alter table public.admin_matches enable row level security;

drop policy if exists "adm_select" on public.admin_matches;
create policy "adm_select" on public.admin_matches for select using (true);
drop policy if exists "adm_insert" on public.admin_matches;
create policy "adm_insert" on public.admin_matches for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
);
drop policy if exists "adm_update" on public.admin_matches;
create policy "adm_update" on public.admin_matches for update using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
);
drop policy if exists "adm_delete" on public.admin_matches;
create policy "adm_delete" on public.admin_matches for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
);

grant select on public.admin_matches to authenticated, anon;
grant insert, update, delete on public.admin_matches to authenticated;

create or replace function public.admin_create_match(
  p_league text, p_home text, p_away text, p_home_short text, p_away_short text,
  p_time text, p_points int, p_featured boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_caller_role text;
  v_match public.admin_matches%rowtype;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'super_admin') then return jsonb_build_object('error', 'FORBIDDEN'); end if;
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

  return jsonb_build_object('ok', true, 'id', v_match.id, 'code', v_match.id);
end $$;

create or replace function public.admin_delete_match(p_match_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_caller_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'super_admin') then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  delete from public.admin_matches where id = p_match_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_create_match(text, text, text, text, text, text, int, boolean) from public;
grant execute on function public.admin_create_match(text, text, text, text, text, text, int, boolean) to authenticated;
revoke all on function public.admin_delete_match(bigint) from public;
grant execute on function public.admin_delete_match(bigint) to authenticated;

-- ============ 5) ترقية المشتركين إلى مشرف (للسوبر أدمن فقط) ============
create or replace function public.set_user_role(p_target_id uuid, p_new_role text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_caller_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'super_admin' then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_new_role not in ('user', 'admin') then return jsonb_build_object('error', 'INVALID_ROLE'); end if;
  if p_target_id = auth.uid() then return jsonb_build_object('error', 'SELF_ROLE'); end if;

  update public.profiles set role = p_new_role where id = p_target_id;

  insert into public.admin_audit_logs (actor_id, action, resource, resource_id, reason, metadata)
  values (auth.uid(), 'set_role', 'profiles', p_target_id::text, 'role -> ' || p_new_role, '{}'::jsonb);

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ============ 6) توسيع بنك الأسئلة الحديثة (لا يتكرر إدخال سؤال موجود) ============
insert into public.quiz_questions (category, question, options, answer_index) values
-- كأس العالم والبطولات العالمية
('كأس العالم', 'كم منتخباً سيتنافس في كأس العالم 2026؟', array['32','36','48','56'], 2),
('كأس العالم', 'أين تُقام كأس العالم 2026؟', array['قطر','أمريكا وكندا والمكسيك','السعودية','إنجلترا'], 1),
('كأس العالم', 'من فاز بكأس العالم للأندية بنسختها الجديدة 2025؟', array['ريال مدريد','باريس سان جيرمان','برشلونة','مانشستر سيتي'], 2),
('كأس العالم', 'كم فريقاً يشارك في النسخة الجديدة من كأس العالم للأندية 2025؟', array['24','28','32','36'], 2),
('كأس العالم', 'من فاز بكأس العالم للأندية 2023؟', array['مانشستر سيتي','ريال مدريد','الأهلي','فلامينغو'], 0),
('كأس العالم', 'من فاز بكأس القارات للأندية 2024؟', array['الأهلي','ريال مدريد','بوتافوغو','باتشوكا'], 1),
-- يورو 2024
('أوروبا', 'من فاز ببطولة أمم أوروبا يورو 2024؟', array['إنجلترا','فرنسا','إسبانيا','ألمانيا'], 2),
('أوروبا', 'من سجل هدف التقدم الأول لإسبانيا في نهائي يورو 2024؟', array['لامين يامال','نيكو ويليامز','أويارزابال','بيدري'], 1),
('أوروبا', 'من فاز بجائزة أفضل لاعب في يورو 2024؟', array['لامين يامال','جود بيلينغهام','رودري','هاري كين'], 2),
('أوروبا', 'من فاز بجائزة أفضل لاعب شاب في يورو 2024؟', array['بيدري','لامين يامال','جمال موسيالا','فلوريان فيرتز'], 1),
('أوروبا', 'من هو أصغر لاعب يسجل هدفاً في تاريخ بطولة يورو؟', array['بيليه','لامين يامال','أنسو فاتي','كوبي ماينو'], 1),
('أوروبا', 'في أي ملعب أقيم نهائي يورو 2024؟', array['ملعب ويمبلي','ملعب برلين الأولمبي','أليانز أرينا','سانتياغو برنابيو'], 1),
('أوروبا', 'أي منتخب بلغ نهائي يورو 2024 مع إسبانيا؟', array['فرنسا','إنجلترا','ألمانيا','هولندا'], 1),
-- كوبا أمريكا وأمم إفريقيا وآسيا
('أمريكا الجنوبية', 'من فاز بجائزة أفضل لاعب في كوبا أمريكا 2024؟', array['ميسي','لاوتارو مارتينيز','خاميس رودريغيز','فينيسيوس جونيور'], 1),
('إفريقيا', 'من فاز بكأس أمم إفريقيا 2023 المقامة في يناير 2024؟', array['نيجيريا','ساحل العاج','السنغال','المغرب'], 1),
('إفريقيا', 'في أي دولة أقيمت كأس أمم إفريقيا 2023؟', array['السنغال','المغرب','ساحل العاج','مصر'], 2),
('إفريقيا', 'أي نادٍ يُلقب بـ«الدم والذهب» في تونس؟', array['النادي الإفريقي','الترجي الرياضي','النجم الساحلي','البنزرتي'], 1),
('إفريقيا', 'من فاز بدوري أبطال إفريقيا 2024؟', array['الترجي','الأهلي','صن داونز','الوداد'], 1),
('آسيا', 'من هو هداف كأس أمم آسيا 2023 المقامة في قطر؟', array['أكرم عفيف','مباي دياني','سون هيونغ مين','علي رضا جاهانبخش'], 0),
('آسيا', 'من فاز بدوري أبطال آسيا 2023-24؟', array['الهلال','العين','أوراوا','يونغهوانغ'], 1),
('آسيا', 'من فاز بدوري أبطال آسيا للنخبة 2024-25؟', array['الأهلي','الهلال','طوكيو فيردي','النصر'], 1),
-- دوري أبطال أوروبا والبطولات الأوروبية
('أوروبا', 'من فاز بدوري أبطال أوروبا 2024؟', array['باريس سان جيرمان','ريال مدريد','بايرن ميونخ','دورتموند'], 1),
('أوروبا', 'من فاز بدوري أبطال أوروبا 2025؟', array['ريال مدريد','ليفربول','برشلونة','إنتر ميلان'], 2),
('أوروبا', 'في أي ملعب أقيم نهائي دوري أبطال أوروبا 2025؟', array['سانتياغو برنابيو','أليانز أرينا','ويمبلي','ملعب لوزيرو'], 1),
('أوروبا', 'من فاز بجائزة أفضل لاعب في نهائي دوري أبطال أوروبا 2024؟', array['هاري كين','فينيسيوس جونيور','جود بيلينغهام','داني كارفاخال'], 1),
('أوروبا', 'كم لقباً في دوري أبطال أوروبا يملك ريال مدريد بعد لقب 2024؟', array['14','15','16','17'], 1),
('أوروبا', 'كم لقباً في دوري أبطال أوروبا يملك برشلونة بعد لقب 2025؟', array['4','5','6','7'], 2),
('أوروبا', 'من هو مدرب برشلونة الفائز بدوري أبطال أوروبا 2025؟', array['تشافي','رونالد كومان','هانسي فليك','رافائيل ماركيز'], 2),
('أوروبا', 'من فاز بالدوري الأوروبي 2024؟', array['ليفربول','أتالانتا','ليفركوزن','فيورنتينا'], 1),
('أوروبا', 'من فاز بالدوري الأوروبي 2025؟', array['توتنهام','مانشستر يونايتد','أتالانتا','أياكس'], 1),
('أوروبا', 'ما اسم النظام الجديد لدوري الأبطال منذ موسم 2024-25؟', array['نظام خروج المغلوب','النظام السويسري','نظام المجموعات المزدوجة','نظام النقاط'], 1),
('أوروبا', 'كم فريقاً يشارك في دوري الأبطال بالنظام الجديد؟', array['32','36','40','48'], 1),
-- الدوري الإنجليزي
('الدوري الإنجليزي', 'من فاز بلقب الدوري الإنجليزي الممتاز موسم 2024-25؟', array['مانشستر سيتي','ليفربول','أرسنال','تشيلسي'], 1),
('الدوري الإنجليزي', 'من هداف الدوري الإنجليزي الممتاز موسم 2024-25؟', array['إيرلينغ هالاند','محمد صلاح','ألكسندر إيزاك','كول بالمر'], 1),
('الدوري الإنجليزي', 'من أنهى الدوري الإنجليزي 2024-25 في المركز الثاني؟', array['مانشستر سيتي','ليفربول','أرسنال','نيوكاسل'], 2),
('الدوري الإنجليزي', 'من هو مدرب ليفربول الفائز بالدوري 2024-25؟', array['يورغن كلوب','آرني سلوت','بيب غوارديولا','مايكل إدواردز'], 1),
('الدوري الإنجليزي', 'من فاز بكأس الاتحاد الإنجليزي 2025؟', array['مانشستر سيتي','ليفربول','أرسنال','مانشستر يونايتد'], 2),
('الدوري الإنجليزي', 'من فاز بكأس الرابطة الإنجليزية 2025؟', array['تشيلسي','نيوكاسل','ليفربول','توتنهام'], 2),
('الدوري الإنجليزي', 'كم بطولة دوري على التوالي حققها مانشستر سيتي حتى موسم 2023-24؟', array['3','4','5','6'], 1),
('الدوري الإنجليزي', 'كم مباراة يلعبها كل فريق في الدوري الإنجليزي الممتاز بالموسم؟', array['34','36','38','40'], 2),
('الدوري الإنجليزي', 'من سجل أسرع هدف في تاريخ الدوري الإنجليزي الممتاز؟', array['آلان شيرر','شين لونغ','واين روني','سيرجيو أغويرو'], 1),
('الدوري الإنجليزي', 'من فاز بكأس الرابطة الإنجليزية 2024؟', array['تشيلسي','ليفربول','مانشستر سيتي','نيوكاسل'], 1),
-- الدوري الإسباني
('الدوري الإسباني', 'من فاز بلقب الدوري الإسباني موسم 2024-25؟', array['ريال مدريد','أتلتيكو مدريد','برشلونة','ريال سوسيداد'], 2),
('الدوري الإسباني', 'من هداف الدوري الإسباني موسم 2024-25؟', array['كيليان مبابي','روبرت ليفاندوفسكي','فينيسيوس جونيور','جود بيلينغهام'], 1),
('الدوري الإسباني', 'من هو مدرب برشلونة الفائز بالدوري 2024-25؟', array['تشافي','هانسي فليك','لويس إنريكي','ميشيل'], 1),
('الدوري الإسباني', 'من فاز بكأس الملك الإسباني 2025؟', array['برشلونة','أتلتيكو مدريد','ريال مدريد','أثلتيك بلباو'], 2),
('الدوري الإسباني', 'كم عدد فرق الدوري الإسباني الدرجة الأولى؟', array['18','20','22','24'], 1),
('الدوري الإسباني', 'من فاز بلقب الدوري الإسباني موسم 2023-24؟', array['برشلونة','ريال مدريد','جيرونا','أتلتيكو مدريد'], 1),
('الدوري الإسباني', 'من هداف الدوري الإسباني موسم 2023-24؟', array['ليفاندوفسكي','أرتيم دوفبيك','بورخا إغليسياس','فينيسيوس جونيور'], 1),
-- الدوري الإيطالي
('الدوري الإيطالي', 'من فاز بلقب الدوري الإيطالي موسم 2024-25؟', array['ميلان','يوفنتوس','إنتر ميلان','نابولي'], 2),
('الدوري الإيطالي', 'من فاز بلقب الدوري الإيطالي موسم 2023-24؟', array['يوفنتوس','ميلان','إنتر ميلان','أتالانتا'], 2),
('الدوري الإيطالي', 'من هداف الدوري الإيطالي موسم 2023-24؟', array['مشروع أوليفر','لاوتارو مارتينيز','فيكتور أوسيمين','دوشان فلاهوفيتش'], 1),
('الدوري الإيطالي', 'أي نادٍ إيطالي يُلقب بـ«النيراتزوري»؟', array['ميلان','يوفنتوس','إنتر ميلان','روما'], 2),
('الدوري الإيطالي', 'أي نادٍ إيطالي يُلقب بـ«البيانكونيري»؟', array['ميلان','يوفنتوس','إنتر ميلان','لاتسيو'], 1),
('الدوري الإيطالي', 'من فاز بالدوري الأوروبي 2024 من الأندية الإيطالية؟', array['روما','لاتسيو','أتالانتا','فيورنتينا'], 2),
-- الدوري الألماني
('الدوري الألماني', 'من فاز بلقب الدوري الألماني موسم 2023-24؟', array['بايرن ميونخ','دورتموند','باير ليفركوزن','لايبزيغ'], 2),
('الدوري الألماني', 'من فاز بلقب الدوري الألماني موسم 2024-25؟', array['ليفركوزن','بايرن ميونخ','شتوتغارت','دورتموند'], 1),
('الدوري الألماني', 'من هداف الدوري الألماني موسم 2024-25؟', array['فيكتور بونيفاس','هاري كين','لوي أوبيندا','فلوريان فيرتز'], 1),
('الدوري الألماني', 'من هو مدرب باير ليفركوزن بطل 2023-24؟', array['ناغيلسمان','تشابي ألونسو','جوليان توبال','أينريكي'], 1),
('الدوري الألماني', 'كم عدد فرق الدوري الألماني الدرجة الأولى؟', array['16','18','20','22'], 1),
('الدوري الألماني', 'من فاز بكأس ألمانيا 2025؟', array['ليفركوزن','بايرن ميونخ','شتوتغارت','لايبزيغ'], 1),
-- الدوري الفرنسي
('الدوري الفرنسي', 'من فاز بلقب الدوري الفرنسي موسم 2024-25؟', array['مارسيليا','موناكو','باريس سان جيرمان','ليل'], 2),
('الدوري الفرنسي', 'من فاز بكأس فرنسا 2024؟', array['أولمبيك ليون','باريس سان جيرمان','موناكو','مارسيليا'], 1),
('الدوري الفرنسي', 'من فاز بلقب الدوري الفرنسي موسم 2023-24؟', array['باريس سان جيرمان','ليل','موناكو','ريمس'], 0),
('الدوري الفرنسي', 'أي نادٍ فرنسي يلقب بـ«الراقصون الصغار»؟', array['مارسيليا','موناكو','ليل','ليون'], 1),
-- دوري روشن السعودي
('عربية', 'من فاز بلقب دوري روشن السعودي موسم 2024-25؟', array['النصر','الهلال','الأهلي','الاتحاد'], 1),
('عربية', 'من فاز بلقب دوري روشن السعودي موسم 2023-24؟', array['النصر','الاتحاد','الهلال','الأهلي'], 2),
('عربية', 'أي نادٍ سعودي يلقب بـ«الزعيم»؟', array['النصر','الاتحاد','الهلال','الأهلي'], 2),
('عربية', 'كم فريقاً يشارك في دوري روشن السعودي؟', array['14','16','18','20'], 2),
('عربية', 'من هو الهداف التاريخي لمنتخب السعودية؟', array['سامي الجابر','ماجد عبدالله','محمد الدعيع','سالم الدوسري'], 1),
-- جوائز وأرقام قياسية حديثة
('نجوم', 'من فاز بالكرة الذهبية لعام 2024؟', array['فينيسيوس جونيور','بيلينغهام','رودري','لامين يامال'], 2),
('نجوم', 'من فاز بالكرة الذهبية لعام 2025؟', array['لامين يامال','عثمان ديمبيلي','فينيسيوس جونيور','رافينها'], 1),
('نجوم', 'من فاز بجائزة أفضل لاعب في العالم «ذا بيست» لعام 2024؟', array['رودري','لامين يامال','فينيسيوس جونيور','مبابي'], 2),
('نجوم', 'من فاز بجائزة «الفتى الذهبي» لأفضل لاعب شاب لعام 2024؟', array['بيدري','لامين يامال','وارين زائير-إيمري','جود بيلينغهام'], 1),
('نجوم', 'كم مرة فاز ليونيل ميسي بالكرة الذهبية حتى الآن؟', array['7','8','9','10'], 1),
('نجوم', 'من فاز بجائزة بوشكاش لأجمل هدف لعام 2024؟', array['أليخاندرو غارناتشو','كول بالمر','فينيسيوس جونيور','لامين يامال'], 0),
('نجوم', 'من هو الهداف التاريخي لمنتخب الأرجنتين؟', array['غابرييل باتيستوتا','سيرخيو أغويرو','ليونيل ميسي','لاوتارو مارتينيز'], 2),
('نجوم', 'من هو الهداف التاريخي لمنتخب البرازيل؟', array['بيليه','رونالدو نازاريو','نيمار','روماريو'], 2),
('نجوم', 'من هو أفضل لاعب في مونديال 2022 (الكرة الذهبية للمونديال)؟', array['مبابي','ميسي','ألفاريز','مودريتش'], 1),
('نجوم', 'من هو أفضل حارس في مونديال 2022؟', array['كورتويس','إميليانو مارتينيز','اليسون','دوناروما'], 1),
('نجوم', 'من فاز بجائزة «هداف العالم» لأكثر هداف في عام 2024؟', array['هالاند','كريستيانو رونالدو','هاري كين','مبابي'], 1),
('نجوم', 'أي نادٍ تعاقد مع كيليان مبابي صيف 2024؟', array['برشلونة','مانشستر سيتي','ريال مدريد','بايرن ميونخ'], 2),
('نجوم', 'من فاز بكأس السوبر الأوروبي 2024؟', array['أتالانتا','باريس سان جيرمان','ريال مدريد','برشلونة'], 2),
('نجوم', 'من قاد برشلونة للفوز بدوري أبطال أوروبا 2025 من خط الهجوم؟', array['لامين يامال','هاري كين','روبرت ليفاندوفسكي','رافينها'], 3),
-- قوانين وأنظمة
('قوانين', 'كم عدد التبديلات المسموحة لكل فريق في مباريات الدوري الإنجليزي الممتاز؟', array['3','4','5','6'], 2),
('قوانين', 'كم عدد الفرق المشاركة في الدوري الإسباني الممتاز؟', array['18','20','22','24'], 1),
('قوانين', 'كم عدد الحكام الإضافيين في نظام تقنية الفيديو VAR الأساسي؟', array['حكم واحد','حكمان','ثلاثة حكام','أربعة حكام'], 2),
('قوانين', 'كم عدد البطاقات الصفراء المطلوبة للطرد المباشر في مباراة واحدة؟', array['1','2','3','4'], 1),
('قوانين', 'ما مدة التوقف في مباراة كرة القدم النظامية بدون وقت إضافي؟', array['60 دقيقة','75 دقيقة','90 دقيقة','100 دقيقة'], 2),
('قوانين', 'منذ أي موسم أصبح دوري الأبطال بنظام 36 فريقاً؟', array['2022-23','2023-24','2024-25','2025-26'], 2),
('قوانين', 'كم عدد الفرق القادرة على العبور من مرحلة الدوري في النظام السويسري لدوري الأبطال؟', array['16','24','8','12'], 1)
on conflict (question) do nothing;