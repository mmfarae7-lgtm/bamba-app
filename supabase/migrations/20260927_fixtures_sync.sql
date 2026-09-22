-- ============================================================
-- 2026-09-27 — مزامنة مباريات الـAPI + دعم تاريخ الإنشاء (اليوم/غداً)
-- 1) عمود external_id لتجنّب تكرار مباريات الـAPI
-- 2) admin_create_match يقبل تاريخ المباراة (بتوافق خلفي كامل)
-- 3) admin_upsert_fixtures: جدولة جماعية من مصدر خارجي مع منع التكرار
-- ============================================================

alter table public.admin_matches add column if not exists external_id text;

create index if not exists admin_matches_match_date_idx on public.admin_matches (match_date);

-- ---------- 2) admin_create_match + تاريخ المباراة ----------
drop function if exists public.admin_create_match(
  text, text, text, text, text, text, int, boolean
);

create or replace function public.admin_create_match(
  p_league text, p_home text, p_away text, p_home_short text, p_away_short text,
  p_time text, p_points int, p_featured boolean, p_match_date date
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

-- ---------- 3) admin_upsert_fixtures: مزامنة جماعية من الـAPI ----------
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
begin
  if not public.has_admin_module('matches', true) then return jsonb_build_object('error', 'FORBIDDEN'); end if;
  if p_fixtures is null or jsonb_typeof(p_fixtures) <> 'array' then
    return jsonb_build_object('error', 'INVALID_FIXTURES');
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

    -- منع التكرار: نفس الـexternal_id (إن وُجد) أو نفس اليوم والفريقين
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