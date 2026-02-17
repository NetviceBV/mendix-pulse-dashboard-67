

## Fix: Linting Overrides Not Applied During Checks

### Problem

There is an identifier mismatch in the linting overrides flow:
- The `AppLintingOverrides` component saves overrides with `app_id = app.app_id` (Mendix app name, e.g., `"prikklbackoffice"`)
- The `run-linting-checks` edge function queries overrides using `app_id = appId` where `appId` is the Mendix **project_id** UUID (e.g., `"73fcfab5-..."`)
- Result: the override query returns zero rows, so all 26 globally enabled rules run instead of just the 1 overridden rule (001_0001)

Your overrides table currently has 26 rows for `prikklbackoffice`, most disabling rules. But the edge function never finds them because it searches by UUID.

### Fix

Update `AppLintingOverrides` to use `app.project_id` instead of `app.app_id`, consistent with how the edge function and all other linting queries work. Then migrate existing override data to use the correct identifier.

### Technical Changes

**1. `src/components/AppCard.tsx`**
- Change line 1199: `<AppLintingOverrides appId={app.app_id}` to `<AppLintingOverrides appId={app.project_id}`

**2. Database migration**
- Update existing `linting_policy_overrides` rows: replace `app_id = 'prikklbackoffice'` with the correct project_id UUID (`73fcfab5-e311-4eb5-8174-537f1b89edd0`) so existing overrides are preserved

No edge function changes needed -- it already queries by the correct project_id.

