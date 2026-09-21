/*
# Profile edits + real leaderboard + avatars storage

1. Profiles
- Add columns: avatar_url, phone, gender, dob.
- Grant UPDATE on the new columns to authenticated (in addition to username, country).

2. Leaderboard
- Public view `leaderboard` exposing only ranking-safe columns
  (username, country, user_points, bamba_balance, avatar_url, role).
  All subscribers are ranked by real data — no fake/demo rows.

3. Storage
- Bucket `avatars` (public, images) for profile pictures.
- Public read; uploads managed by authenticated users.
*/

-- ====== أعمدة الملف الشخصي ======
alter table profiles
  add column if not exists phone text,
  add column if not exists gender text,
  add column if not exists dob text,
  add column if not exists avatar_url text;

grant update (username, country, avatar_url, phone, gender, dob) on public.profiles to authenticated;

-- الرصيد الترحيبي للحسابات الجديدة: 100 بمبة (يبدأ الجميع من 0 نقطة)
alter table profiles alter column bamba_balance set default 100;

-- ====== عرض الترتيب الحقيقي (بدون بيانات وهمية) ======
-- يُنفَّذ العرض بصلاحيات المالك (postgres) فيتجاوز RLS ويعرض كل الأعضاء،
-- مع إظهار أعمدة الترتيب الآمنة فقط (دون البريد الإلكتروني).
drop view if exists public.leaderboard;
create view public.leaderboard with (security_invoker = false) as
select
  id,
  username,
  country,
  user_points,
  bamba_balance,
  avatar_url,
  role,
  created_at
from public.profiles;

grant select on public.leaderboard to authenticated;
grant select on public.leaderboard to anon;

-- ====== تخزين الصور الشخصية ======
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "av_public_read" on storage.objects;
create policy "av_public_read" on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "av_auth_upload" on storage.objects;
create policy "av_auth_upload" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "av_auth_update" on storage.objects;
create policy "av_auth_update" on storage.objects for update to authenticated using (bucket_id = 'avatars') with check (bucket_id = 'avatars');

drop policy if exists "av_auth_delete" on storage.objects;
create policy "av_auth_delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars');

grant select, insert, update, delete on storage.objects to authenticated;