

## Add Edit User Functionality

### Overview
Allow admins to edit existing users: change email, full name, password (optional), and role (admin/user). This requires an "update" action in the edge function and an edit dialog in the UI.

### Changes

#### 1. Update `supabase/functions/manage-users/index.ts`
Add a new `action: "update"` handler that:
- Accepts `userId`, `email`, `fullName`, `password` (optional), `role` (optional)
- Calls `adminClient.auth.admin.updateUser(userId, { email, password, user_metadata })` to update auth fields
- If `role` is provided, upserts the `user_roles` table (delete old role, insert new one)
- Prevents changing your own role (safety guard)

#### 2. Update `src/components/UserManagement.tsx`
- Add an edit dialog (using the existing Dialog component) that opens when clicking an edit icon on a user row
- Pre-populate fields: email, full name, role (from `user.roles`)
- Password field is optional (only updates if filled)
- Role dropdown: admin / user
- Add a `Pencil` icon button next to the delete button in each row
- Add `roles` to the `AuthUser` interface
- Display role as a badge in the table

### Technical Details
- `adminClient.auth.admin.updateUser()` supports updating email, password, and user_metadata in one call
- Role update: delete existing roles for user, insert new role (keeps it simple with single-role model)
- The edge function already verifies admin status, so the update action inherits that protection

