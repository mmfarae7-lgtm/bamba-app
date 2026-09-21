/*
# Store: partners + products + image storage

1. New Tables
- `store_partners`
  - id (uuid, pk)
  - name (text, not null)
  - category (text, not null) — محل رياضي | مطعم | متجر | خدمات
  - description (text)
  - logo_url (text, public storage path)
  - discount (int, default 20) — 20 | 50 | 70
  - active (bool, default true)
  - created_at (timestamptz)
- `store_products`
  - id (uuid, pk)
  - name (text, not null)
  - description (text)
  - category (text, default 'رياضي')
  - price_bamba (int, default 0)
  - partner_id (uuid, references store_partners)
  - image_url (text, public storage path)
  - discount (int, default 20)
  - active (bool, default true)
  - created_at (timestamptz)

2. Security
- RLS enabled on both tables.
- Everyone can read (public storefront).
- Only super_admin (via profiles) can insert/update/delete.
- Storage bucket `store-assets` is public for reads; uploads restricted to super_admin.
*/

-- مساعد صلاحيات: هل المستخدم الحالي مدير عام؟
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

-- ====== الشركاء (محلات / مطاعم / متاجر) ======
create table if not exists store_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'متجر',
  description text,
  logo_url text,
  discount int not null default 20,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table store_partners enable row level security;

drop policy if exists "sp_read_all" on store_partners;
create policy "sp_read_all" on store_partners for select using (true);

drop policy if exists "sp_insert_admin" on store_partners;
create policy "sp_insert_admin" on store_partners for insert to authenticated with check (public.is_super_admin());

drop policy if exists "sp_update_admin" on store_partners;
create policy "sp_update_admin" on store_partners for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "sp_delete_admin" on store_partners;
create policy "sp_delete_admin" on store_partners for delete to authenticated using (public.is_super_admin());

-- ====== المنتجات ======
create table if not exists store_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'رياضي',
  price_bamba int not null default 0,
  partner_id uuid references store_partners(id) on delete set null,
  image_url text,
  discount int not null default 20,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table store_products enable row level security;

drop policy if exists "spr_read_all" on store_products;
create policy "spr_read_all" on store_products for select using (true);

drop policy if exists "spr_insert_admin" on store_products;
create policy "spr_insert_admin" on store_products for insert to authenticated with check (public.is_super_admin());

drop policy if exists "spr_update_admin" on store_products;
create policy "spr_update_admin" on store_products for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "spr_delete_admin" on store_products;
create policy "spr_delete_admin" on store_products for delete to authenticated using (public.is_super_admin());

-- ====== تخزين صور المتجر ======
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-assets', 'store-assets', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

drop policy if exists "sa_public_read" on storage.objects;
create policy "sa_public_read" on storage.objects for select using (bucket_id = 'store-assets');

drop policy if exists "sa_admin_upload" on storage.objects;
create policy "sa_admin_upload" on storage.objects for insert to authenticated with check (bucket_id = 'store-assets' and public.is_super_admin());

drop policy if exists "sa_admin_update" on storage.objects;
create policy "sa_admin_update" on storage.objects for update to authenticated using (bucket_id = 'store-assets' and public.is_super_admin()) with check (bucket_id = 'store-assets' and public.is_super_admin());

drop policy if exists "sa_admin_delete" on storage.objects;
create policy "sa_admin_delete" on storage.objects for delete to authenticated using (bucket_id = 'store-assets' and public.is_super_admin());

grant select, insert, update, delete on storage.objects to authenticated;

-- ====== بيانات تجريبية أولية (تُستبدل من لوحة الإدارة) ======
insert into store_partners (name, category, description, discount) values
  ('متجر سبورت تايم', 'محل رياضي', 'ملابس وأدوات رياضية أصلية', 50),
  ('مطعم كرة الهدف', 'مطعم', 'وجبات رياضية وخصم خاص لأعضاء بمبا', 20),
  ('بوتيك المدرجات', 'متجر', 'أطقم وهدايا المشجعين', 70)
on conflict do nothing;

insert into store_products (name, description, category, price_bamba, partner_id, discount)
select 'قميص النادي الرسمي', 'قميص أصلي بمقاسات متعددة', 'ملابس', 950, id, 50 from store_partners where name = 'متجر سبورت تايم'
union all
select 'حذاء كرة قدم احترافي', 'مقاسات 39-46', 'أدوات', 1200, id, 50 from store_partners where name = 'متجر سبورت تايم'
union all
select 'كرة مباريات معتمدة', 'مقاس 5 معتمد', 'أدوات', 600, id, 50 from store_partners where name = 'متجر سبورت تايم'
union all
select 'حقيبة رياضية كبيرة', 'مادة مقاومة للماء', 'أدوات', 450, id, 50 from store_partners where name = 'متجر سبورت تايم'
on conflict do nothing;