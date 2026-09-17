/*
# إصلاح حساب المدير العام — super_admin / admin@123

الغرض:
- توحيد حساب المدير العام على البريد super_admin@bamba.app
- تعيين اسم المستخدم super_admin وكلمة المرور admin@123
- ضمان وجود صف الـ profile بدور super_admin

التنفيذ:
- شغّل هذا الملف كاملاً في محرر SQL داخل لوحة تحكم Supabase.
- آمن للتنفيذ المتكرر (Idempotent) — لا يحذف أي بيانات.
- شاشة الدخول في التطبيق تقبل "super_admin" أو البريد مباشرة.

ملاحظة أمنية: غيّر كلمة المرور بعد أول دخول إن رغبت — التغيير يتم بنفس الطريقة.
*/

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users
  WHERE email IN ('super_admin@bamba.app', 'admin@bamba.app')
  ORDER BY (email = 'super_admin@bamba.app') DESC
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'super_admin@bamba.app',
      crypt('admin@123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      ''
    ) RETURNING id INTO v_admin_id;
  ELSE
    UPDATE auth.users
    SET email = 'super_admin@bamba.app',
        encrypted_password = crypt('admin@123', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_admin_id;
  END IF;

  INSERT INTO public.profiles (id, username, email, role, bamba_balance, user_points, country)
  VALUES (v_admin_id, 'super_admin', 'super_admin@bamba.app', 'super_admin', 100000, 9999, 'السعودية')
  ON CONFLICT (id) DO UPDATE SET
    username = 'super_admin',
    email = 'super_admin@bamba.app',
    role = 'super_admin';
END $$;
