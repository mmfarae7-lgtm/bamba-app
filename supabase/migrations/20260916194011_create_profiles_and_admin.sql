/*
# Create profiles table with roles and super admin user

1. New Tables
- `profiles`
  - `id` (uuid, primary key, references auth.users)
  - `username` (text, unique, not null)
  - `email` (text, unique, not null)
  - `role` (text, not null, default 'user') — values: 'user', 'admin', 'super_admin'
  - `bamba_balance` (integer, default 1320)
  - `user_points` (integer, default 0)
  - `country` (text, default 'السعودية')
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `profiles`.
- Users can read their own profile.
- Users can update their own profile (except role, which is admin-only).
- Super admins can read and update all profiles.

3. Super Admin Account
- Creates a super admin user via auth.users with email admin@bamba.app
- Password: Bamba@2025!
- Inserts corresponding profile row with role = 'super_admin'
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'user',
  bamba_balance integer NOT NULL DEFAULT 1320,
  user_points integer NOT NULL DEFAULT 0,
  country text NOT NULL DEFAULT 'السعودية',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Super admins can read all profiles
DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Users can update their own profile (non-role fields only)
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Super admins can update any profile
DROP POLICY IF EXISTS "update_all_profiles_admin" ON profiles;
CREATE POLICY "update_all_profiles_admin" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Users can insert their own profile
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- Create super admin user using the auth schema
-- First create the auth user
DO $$
BEGIN
  -- Check if admin user already exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@bamba.app') THEN
    -- Insert into auth.users with encrypted password
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_sso_user,
      email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'admin@bamba.app',
      crypt('Bamba@2025!', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      ''
    );
  END IF;
END $$;

-- Insert the super admin profile
INSERT INTO profiles (id, username, email, role, bamba_balance, user_points, country)
SELECT id, 'Super Admin', 'admin@bamba.app', 'super_admin', 100000, 9999, 'السعودية'
FROM auth.users
WHERE email = 'admin@bamba.app'
ON CONFLICT (id) DO UPDATE SET
  role = 'super_admin',
  bamba_balance = 100000,
  user_points = 9999;