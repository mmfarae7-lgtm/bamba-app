/*
# تشديد الحماية (RLS) — معالجة تحذيرات Security Advisor في لوحة Supabase

الهدف: تفعيل RLS على الجداول العامة الثلاثة مع سياسات تحافظ على سلوك التطبيق كما هو،
وإعادة بناء عرض الترتيب بمبدأ `security_invoker` يحترم RLS بدل تجاوزه — دون تغيير النتائج.
*/

-- ============ 1) match_final_scores — قراءة عامة معتمدة (النتائج)، الكتابة للمدير فقط ============
alter table public.match_final_scores enable row level security;

-- القراءة تُعرض للجميع كما كان (أي مستخدم يرى النتائج المعتمدة عبر التطبيق)
drop policy if exists "mfs_select_public" on public.match_final_scores;
create policy "mfs_select_public" on public.match_final_scores
  for select to anon, authenticated using (true);

-- الكتابة/التعديل حصريًا للمديرين (إضافة دفاعية — الكتابة القياسية تمر عبر score_match_points)
drop policy if exists "mfs_admin_write" on public.match_final_scores;
create policy "mfs_admin_write" on public.match_final_scores
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'super_admin')));

-- ============ 2) quiz_questions — لا قراءة مباشرة إطلاقًا (حماية الإجابات الصحيحة) ============
alter table public.quiz_questions enable row level security;
-- لا نضيف أي سياسة قراءة: RLS يمنع القراءة المباشرة فيبقى الوصول الوحيد عبر
-- get_quiz_questions / answer_quiz_question (SECURITY DEFINER بصلاحيات المالك فلا تتأثر).

-- ============ 3) scoring_rule_versions — بيانات مرجعية، لا وصول مباشر للمستخدمين ============
alter table public.scoring_rule_versions enable row level security;
-- بدون سياسات: لا قراءة ولا كتابة مباشرة عبر PostgREST.

-- ============ 4) leaderboard — عرض يحترم RLS (security_invoker) بنفس الأعمدة ============
drop view if exists public.leaderboard;

create view public.leaderboard with (security_invoker = true) as
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

-- صلاحيات أعمدة: ما يُقرأ من profiles مباشرة هو نفس ما كان يُعرض عبر العرض (بلا بريد/هاتف)
grant select (id, username, country, user_points, bamba_balance, avatar_url, role, created_at)
  on public.profiles to anon, authenticated;

-- سياسة قراءة عامة لصفوف الترتيب (نفس النتيجة التي كان يظهرها العرض سابقًا)
drop policy if exists "rb_public_ranking_select" on public.profiles;
create policy "rb_public_ranking_select" on public.profiles
  for select to anon, authenticated using (true);