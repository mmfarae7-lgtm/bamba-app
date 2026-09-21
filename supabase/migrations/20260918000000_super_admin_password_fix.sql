/*
# إصلاح حساب المدير العام — super_admin / admin@123 (نسخة v2 — تُصلح خطأ الدخول 500)

لماذا هذه النسخة؟
- النسخة السابقة كانت تنشئ المستخدم بـ INSERT مباشر في auth.users فقط، دون صف
  مقابل في auth.identities — وبدونه يرجع Supabase Auth خطأ 500
  "Database error querying schema" عند كل محاولة دخول (هذا هو سبب عجز حساب
  المدير في المشروع القديم).
- هذه النسخة: تنشئ صف الهوية الناقص في auth.identities، وتطبيع أعمدة الـ tokens،
  ثم تضبط البريد super_admin@bamba.app وكلمة المرور admin@123، وتضمن صف
  profiles بدور super_admin.

التنفيذ: انسخ الملف كاملاً في SQL Editor داخل لوحة Supabase ونفّذه.
آمن للتكرار (Idempotent) — لا يحذف أي بيانات.
شاشة الدخول في التطبيق تقبل "super_admin" أو البريد مباشرة.

بديل من اللوحة (إن رغبت): Authentication → Users → Add user
(البريد super_admin@bamba.app، كلمة المرور admin@123، تفعيل تلقائي)
ثم نفّذ هذا الملف لضبط صف profiles والدور.
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
      raw_app_meta_data, raw_user_meta_data, is_sso_user, email_change,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, phone_change_token, phone_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'super_admin@bamba.app',
      crypt('admin@123', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{"username":"super_admin"}',
      false,
      '',
      '', '', '', '', '', ''
    ) RETURNING id INTO v_admin_id;
  ELSE
    UPDATE auth.users
    SET email = 'super_admin@bamba.app',
        encrypted_password = crypt('admin@123', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change_token_current = '',
        phone_change_token = '',
        phone_change = '',
        email_change = '',
        updated_at = now()
    WHERE id = v_admin_id;
  END IF;

  -- الإصلاح الأساسي: صف الهوية الناقص في auth.identities — سبب خطأ 500 عند الدخول
  -- (معدَّل لمخطط Supabase الحديث: لا يوجد last_updated_at، وemail عمود مُولَّد تلقائياً)
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  SELECT gen_random_uuid(), v_admin_id, 'email', 'email',
         json_build_object('sub', v_admin_id::text, 'email', 'super_admin@bamba.app', 'email_verified', true),
         now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_admin_id AND provider_id = 'email'
  );

  INSERT INTO public.profiles (id, username, email, role, bamba_balance, user_points, country)
  VALUES (v_admin_id, 'super_admin', 'super_admin@bamba.app', 'super_admin', 100000, 9999, 'السعودية')
  ON CONFLICT (id) DO UPDATE SET
    username = 'super_admin',
    email = 'super_admin@bamba.app',
    role = 'super_admin';
END $$;
