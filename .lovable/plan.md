

## Per-App Linting Rule Overrides

### Concept

Use a **sparse overrides table** -- only store a row when an app's setting differs from the global default. When no override exists, the app inherits the global setting automatically.

### How It Works

```text
Global Policy (linting_policies)       App Override (linting_policy_overrides)
+------------------+-----------+       +--------+------------------+-----------+
| rule_id          | is_enabled|       | app_id | rule_id          | is_enabled|
+------------------+-----------+       +--------+------------------+-----------+
| 001_0001         | true      |       | app-X  | 001_0001         | false     |  <-- turned OFF for this app
| 001_0002         | false     |       | app-X  | 001_0002         | true      |  <-- turned ON for this app
| 002_0001         | true      |       |        |                  |           |  <-- no override = use global
+------------------+-----------+       +--------+------------------+-----------+
```

**Effective state for app-X:**
- `001_0001`: OFF (overridden)
- `001_0002`: ON (overridden)
- `002_0001`: ON (inherited from global)

### Database Changes

**New table: `linting_policy_overrides`**
```sql
CREATE TABLE public.linting_policy_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  app_id text NOT NULL,
  policy_id uuid REFERENCES public.linting_policies(id) ON DELETE CASCADE NOT NULL,
  is_enabled boolean NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, app_id, policy_id)
);

ALTER TABLE linting_policy_overrides ENABLE ROW LEVEL SECURITY;
-- Standard RLS: users can only manage their own overrides
```

No changes to the existing `linting_policies` table.

### Frontend Changes

**1. App-level linting settings UI (new component: `AppLintingOverrides.tsx`)**
- Shown inside the app settings dialog or AppCard expanded view
- Lists all global rules, showing their effective state for this app
- Each rule shows a visual indicator if it's overridden vs inherited
- Toggle creates/deletes an override row (not modifying global)
- "Reset to Global" button per rule (deletes the override)
- "Reset All" button to clear all overrides for the app

**2. Global settings page (`LintingSettings.tsx`)**
- No changes needed -- continues to manage `linting_policies` as-is

### Edge Function / Query Logic

When running linting checks for an app, the effective rule set is resolved by:

1. Fetch all global policies for the user
2. Fetch any overrides for (user, app)
3. Merge: if an override exists, use its `is_enabled`; otherwise use global `is_enabled`
4. Only run rules where the effective `is_enabled` is `true`

This merge can be done either in the edge function before running checks, or as a database view/function.

### Benefits

- **Minimal storage**: only stores differences, not a full copy per app
- **Automatic inheritance**: new global rules immediately apply to all apps
- **Easy reset**: delete the override row to revert to global
- **Clear audit**: you can see exactly what was customized per app
- **Global changes propagate**: if you enable/disable a rule globally, all apps without an override follow automatically

