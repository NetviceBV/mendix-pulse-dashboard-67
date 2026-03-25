

## Role-Based Settings Tabs + Change Password

### Overview
Regular users see only "Mendix Credentials" and a new "Change Password" tab. Admins see all tabs. This requires the `user_roles` table (from the previously approved RBAC plan) and a new `useUserRole` hook.

### Database Changes (Migration)

1. Create `app_role` enum, `user_roles` table, `has_role` function
2. Assign `admin` to all existing users
3. Auto-assign `user` role to new users via trigger
4. RLS: authenticated can SELECT; only service_role can INSERT/UPDATE/DELETE

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages roles" ON public.user_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- All existing users become admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users ON CONFLICT DO NOTHING;

-- New users auto-get 'user' role
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
```

### Code Changes

#### 1. New: `src/hooks/useUserRole.ts`
- Query `user_roles` for current user's role
- Return `{ isAdmin, isLoading }`

#### 2. New: `src/components/ChangePassword.tsx`
- Simple form: new password + confirm password
- Calls `supabase.auth.updateUser({ password })` directly (works for logged-in users)
- Toast on success/error

#### 3. Update: `src/pages/Settings.tsx`
- Use `useUserRole()` hook
- Default tab: `credentials` for users, `general` for admins
- Conditionally render admin-only tabs (General, Webhooks, Emails, Templates, Log Monitoring, OWASP, OWASP History, Linting, User Management)
- Always show: "Mendix Credentials" and "Change Password" tabs for all users

#### 4. Update: `supabase/functions/manage-users/index.ts`
- Add admin check: query `user_roles` to verify caller is admin before any action
- On `create`: insert role into `user_roles` (default `user`)

### Technical Details
- `supabase.auth.updateUser({ password })` updates the currently authenticated user's password -- no edge function needed
- Admin tab visibility is enforced client-side for UX; the edge function enforces server-side for security

