

## Make Email Templates Global (Not Per-User)

### Problem
Email templates are currently stored per-user (`user_id` column) and queried by the triggering user's ID. This means:
- Each admin who opens the Email Templates page creates their own copy
- Edge functions look up templates by `action.user_id`, which fails if that user never created templates
- The user wants one shared set of templates, editable by any admin

### Changes

#### 1. Edge function: `run-cloud-actions-v2/index.ts`
Remove `.eq('user_id', action.user_id)` from the template query. Instead, query by `template_type` only and use `.limit(1).maybeSingle()` so it picks up whichever admin's template exists.

#### 2. Edge function: `monitor-environment-logs/index.ts`
Same change -- remove the `user_id` filter from the `email_templates` query.

#### 3. Frontend: `src/components/EmailTemplates.tsx`
- In `loadTemplates()`: already queries without `user_id` filter (RLS handles it). Change: remove RLS dependency by having the load query not filter by user -- but since RLS restricts SELECT to `auth.uid() = user_id`, we need to update RLS.
- In `createDefaultTemplates()`: keep as-is (templates are created under the current admin's `user_id`), but add `ON CONFLICT` handling so only one set exists.

#### 4. Database migration: Update RLS on `email_templates`
- Add a SELECT policy allowing all authenticated users to read all templates (so the edge function with service role already bypasses RLS, and admins can see templates created by other admins)
- Keep INSERT/UPDATE/DELETE restricted to admins only (using `has_role`)
- This ensures any admin can edit the shared templates

#### 5. Frontend: Prevent duplicate template sets
Update `createDefaultTemplates()` to check if *any* templates exist (not just the current user's) before creating defaults. This prevents each admin from creating their own copy.

### Technical Details
- The edge functions use `createClient(url, serviceKey)` which bypasses RLS, so removing the `user_id` filter is sufficient
- The `loadTemplates` query already omits a `user_id` filter but relies on RLS -- updating the SELECT policy to allow all authenticated users ensures any admin sees the shared set
- Only one set of templates will exist; the first admin to open the page creates them

