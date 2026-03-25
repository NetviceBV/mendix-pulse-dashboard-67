

## Fix: Global Email Templates Access

### Problem
Three issues combine to break email templates for all users except the original creator:

1. **RLS policies** are per-user (`auth.uid() = user_id`), so only user `fa7cf1c9-...` can see/edit the templates
2. **Unique constraint** on `template_type` (without `user_id`) prevents other users from creating their own copies
3. **Reset button** exists in code but doesn't help because `createDefaultTemplates` checks for existing templates globally (via service query) but can't see them due to RLS, then fails on the unique constraint when inserting

### Solution
Make templates truly global as intended by the architecture memory. Update RLS so all authenticated users can read templates, and admins can manage them.

### Changes

#### 1. Migration: Update RLS policies on `email_templates`
- **DROP** all four existing per-user RLS policies
- **CREATE** new policies:
  - `SELECT` for `authenticated`: `USING (true)` — all authenticated users can read
  - `INSERT` for `authenticated`: `WITH CHECK (has_role(auth.uid(), 'admin'))` — only admins can create
  - `UPDATE` for `authenticated`: `USING (has_role(auth.uid(), 'admin'))` — only admins can update
  - `DELETE` for `authenticated`: `USING (has_role(auth.uid(), 'admin'))` — only admins can delete

#### 2. `src/components/EmailTemplates.tsx` — Fix reset and creation logic
- Remove `user_id` filtering from `resetTemplates` (delete all templates, not just current user's)
- In `createDefaultTemplates`, skip the user check and just insert templates (the unique constraint will prevent duplicates, and the admin RLS will enforce permissions)
- Always show the Reset button (it's already there but templates fail to load for non-owners, so the whole component appears empty)

### Files
- New migration SQL — update RLS policies on `email_templates`
- `src/components/EmailTemplates.tsx` — adjust delete/create logic to work with global templates

