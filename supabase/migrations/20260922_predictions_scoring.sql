/*
# نظام النقاط الحقيقي — توقعات + احتساب تلقائي

1. جدول `predictions` — توقعات الأعضاء (نتيجة واحدة لكل مباراة لكل عضو).
2. جدول `match_final_scores` — النتائج المعتمدة (يدخلها المدير من اللوحة).
3. دالة `score_match_points()` — تحتسب النقاط آلياً بقواعد النظام:
   - توقع صحيح بالنتيجة: 3 نقاط (مباراة نارية: 5).
   - توقع صحيح للفائز/التعادل بدون أهداف: 1 نقطة (نارية: 2).
   - نتيجة نادرة (توقعها أقل من 10% من الأعضاء): +1 نقطة إضافية
     (4 للنارمية العادية / 6 للنارمية النادرة).
   - تُحدَّث نقاط العضو في `profiles.user_points` مباشرة — بلا أي تدخل يدوي.
4. تصفير نقاط حسابات الإدارة (super_admin) حتى لا تتصدّر الترتيب.
*/

-- ====== توقعات الأعضاء ======
create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id int not null,
  home_score int not null check (home_score between 0 and 99),
  away_score int not null check (away_score between 0 and 99),
  outcome text not null check (outcome in ('1', 'X', '2')),
  prediction_result text not null,
  points_awarded int not null default 0,
  scored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists idx_predictions_match on public.predictions (match_id);
create index if not exists idx_predictions_user on public.predictions (user_id);

alter table public.predictions enable row level security;

drop policy if exists "pred_own_select" on public.predictions;
create policy "pred_own_select" on public.predictions for select using (
  user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin'))
);

drop policy if exists "pred_own_insert" on public.predictions;
create policy "pred_own_insert" on public.predictions for insert with check (user_id = auth.uid());

drop policy if exists "pred_own_update" on public.predictions;
create policy "pred_own_update" on public.predictions for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "pred_own_delete" on public.predictions;
create policy "pred_own_delete" on public.predictions for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.predictions to authenticated;

-- ====== النتائج المعتمدة للمباريات ======
create table if not exists public.match_final_scores (
  match_id int primary key,
  home_goals int not null check (home_goals >= 0),
  away_goals int not null check (away_goals >= 0),
  is_fixture boolean not null default false,
  scored_at timestamptz not null default now()
);

grant select on public.match_final_scores to authenticated;
grant select on public.match_final_scores to anon;

-- ====== دالة احتساب النقاط (تُستدعى من لوحة الإدارة عند اعتماد نتيجة) ======
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
  v_rec record;
  v_total int;
  v_exact_count int;
  v_rare boolean;
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

  return jsonb_build_object(
    'match_id', p_match_id,
    'scored_predictions', v_scored,
    'points_awarded', v_points
  );
end;
$$;

revoke all on function public.score_match_points(int, int, int, boolean) from public;
grant execute on function public.score_match_points(int, int, int, boolean) to authenticated;

-- ====== نتائج أولية للمباريات المنتهية في البيانات التجريبية ======
insert into public.match_final_scores (match_id, home_goals, away_goals, is_fixture)
values (5, 2, 1, false), (6, 0, 0, false)
on conflict (match_id) do nothing;

-- ====== حسابات الإدارة لا تُنافس في الترتيب (تُصفَّر نقاطها تلقائياً) ======
update public.profiles set user_points = 0 where role in ('admin', 'super_admin');