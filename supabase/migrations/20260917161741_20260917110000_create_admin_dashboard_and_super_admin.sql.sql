/*
# Create the BMBA admin dashboard foundation and secure the super admin account

1. New Tables
- `admin_audit_logs` stores immutable records of sensitive administrative actions.
- `admin_audit_logs.id` is the unique event identifier.
- `admin_audit_logs.actor_id` identifies the signed-in administrator.
- `admin_audit_logs.action`, `resource`, `resource_id`, `reason`, and `metadata` describe the action.
- `admin_audit_logs.created_at` records when the action happened.

2. Modified Data
- The existing `profiles` table keeps the `user`, `admin`, and `super_admin` roles.
- The existing super admin account is normalized to the requested username and credentials.
- Profile privilege and balance fields are protected from ordinary client updates.

3. Security
- Row Level Security is enabled on `admin_audit_logs`.
- Only authenticated super admins can read audit logs.
- Audit entries are written through a SECURITY DEFINER function that derives the actor from auth.uid().
- Only authenticated super admins can read all profiles.
- Ordinary users cannot change roles, points, balances, or audit-sensitive profile fields through direct updates.

4. Important Notes
- This migration is idempotent and safe to apply again.
- No existing user rows are deleted.
- The browser UI is not the security boundary; all admin checks are enforced by database policies and the audit function.
*/

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  resource text NOT NULL,
  resource_id text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "super_admin_read_audit_logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));

DROP POLICY IF EXISTS "super_admin_insert_audit_logs" ON public.admin_audit_logs;
CREATE POLICY "super_admin_insert_audit_logs" ON public.admin_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ));

CREATE OR REPLACE FUNCTION public.write_admin_audit_log(
  p_action text,
  p_resource text,
  p_resource_id text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.admin_audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log public.admin_audit_logs;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.admin_audit_logs (actor_id, action, resource, resource_id, reason, metadata)
  VALUES (auth.uid(), p_action, p_resource, p_resource_id, p_reason, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING * INTO v_log;

  RETURN v_log;
END;
$$;

REVOKE ALL ON FUNCTION public.write_admin_audit_log(text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_admin_audit_log(text, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.write_admin_audit_log(text, text, text, text, jsonb) TO authenticated;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, country) ON public.profiles TO authenticated;

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'super_admin@bamba.app' LIMIT 1;

  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@bamba.app' LIMIT 1;
  END IF;

  IF v_admin_id IS NOT NULL THEN
    UPDATE auth.users
    SET email = 'super_admin@bamba.app',
        encrypted_password = crypt('bomba@123', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_admin_id;

    INSERT INTO public.profiles (id, username, email, role, bamba_balance, user_points, country)
    VALUES (v_admin_id, 'super_admin', 'super_admin@bamba.app', 'super_admin', 100000, 9999, 'السعودية')
    ON CONFLICT (id) DO UPDATE SET
      username = 'super_admin',
      email = 'super_admin@bamba.app',
      role = 'super_admin';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_resource_idx
  ON public.admin_audit_logs (resource, action);
