# توقعات بمبا — BMBA

تطبيق توقعات كرة القدم — Vite + React + TypeScript + Supabase.

## التشغيل

1. ثبّت الحزم: `npm install` (أو `yarn install`)
2. ضع مفاتيح Supabase في `.env` (انسخ `.env.example`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (مفتاح عام يظهر في كل نسخة منشورة)
3. شغّل: `npm run dev`

## قاعدة البيانات

نفّذ ملفات `supabase/migrations/` بالترتيب الزمني في محرر SQL داخل لوحة تحكم Supabase:

1. `20260916194011_create_profiles_and_admin.sql`
2. `20260917161741_20260917110000_create_admin_dashboard_and_super_admin.sql.sql`
3. `20260918000000_super_admin_password_fix.sql` — حساب المدير العام `super_admin` / `admin@123` (يقبل الدخول باسم المستخدم أو البريد `super_admin@bamba.app`)
4. `20260918000100_production_foundation.sql` — سجل النقاط، سجل المحفظة مع Idempotency، إصدارات قواعد النقاط، Feature Flags، إعدادات النظام مع سجل التغييرات، أحداث المباريات، الحذف الناعم

## الشعار الرسمي

- المصدر الوحيد: `public/assets/branding/bmba-logo.png` (2000×2000 بخلفية شفافة)
- كل الاستخدامات تمر عبر `src/config/branding.ts` ومكوّن `<BrandLogo />`
- الأيقونات المشتقة (192/512/maskable/apple/og) مولّدة من نفس الملف الرسمي

## التثبيت كتطبيق (PWA)

افتح الموقع من المتصفح على أي جهاز (أندرويد/آيفون/كمبيوتر) واختر
"إضافة إلى الشاشة الرئيسية" — يُثبَّت بأيقونة الشعار الرسمي ويعمل كتطبيق مستقل
مع شاشة بداية وبدعم العمل دون اتصال (Service Worker).
