

## Admin User Management - Create Users Only

### Overview
Add a "User Management" tab to Settings where you can create new users with email + password. No invitation emails -- you share the credentials yourself.

### Changes

#### 1. New Edge Function: `supabase/functions/manage-users/index.ts`
- JWT-authenticated endpoint using `SUPABASE_SERVICE_ROLE_KEY`
- Actions:
  - **create**: `auth.admin.createUser({ email, password, email_confirm: true })` -- creates user with confirmed email, no email sent
  - **list**: `auth.admin.listUsers()` -- returns existing users
  - **delete**: `auth.admin.deleteUserById()` -- removes a user

#### 2. New Component: `src/components/UserManagement.tsx`
- **Create form**: Email + password + optional full name + "Create User" button
- **Users table**: Lists users with email, created date, last sign-in, delete button
- Toast notifications for success/error
- Calls `supabase.functions.invoke('manage-users', ...)`

#### 3. Update `src/pages/Settings.tsx`
- Add "User Management" tab trigger and content

### Key Detail
Setting `email_confirm: true` in `createUser` marks the email as verified immediately, so the user can sign in right away without any confirmation flow.

