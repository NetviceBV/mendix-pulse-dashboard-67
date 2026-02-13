

## Plan: Linting Rules Management via Mendix Analyzer API

### Overview
Create a system to fetch all available linting rules from the Mendix Analyzer API's `/policies` endpoint, store them in the database, and provide a Settings UI to enable/disable rules globally. These selected rules will later be used when running linting checks on apps.

### Step 1: Add Supabase Secrets

Two new secrets are needed:
- **MENDIX_ANALYZER_API_KEY** -- the API key for authenticating with the Mendix Analyzer
- **MENDIX_ANALYZER_BASE_URL** -- the base URL of the Analyzer server (e.g., `https://mendix-analyzer-production.up.railway.app`)

### Step 2: Database Migration

Create a new table `linting_policies` to store the available rules and their enabled/disabled state per user.

```sql
CREATE TABLE linting_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  rule_id text NOT NULL,          -- e.g., "005_0003"
  category text NOT NULL,         -- e.g., "project_settings"
  title text NOT NULL,
  description text,
  severity text,                  -- e.g., "warning", "error"
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, rule_id)
);

ALTER TABLE linting_policies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own policies" ON linting_policies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own policies" ON linting_policies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own policies" ON linting_policies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own policies" ON linting_policies FOR DELETE USING (auth.uid() = user_id);
```

### Step 3: Edge Function -- `fetch-linting-policies`

A new edge function that calls the Mendix Analyzer API:

- **Endpoint**: `GET {MENDIX_ANALYZER_BASE_URL}/policies`
- **Auth header**: `X-API-Key: {MENDIX_ANALYZER_API_KEY}`
- **Behavior**:
  1. Authenticate the user via JWT
  2. Call the Analyzer `/policies` endpoint
  3. Parse the response (categories with rules)
  4. Upsert all rules into `linting_policies` for the user (new rules default to `is_enabled = true`)
  5. Return the full list of rules

### Step 4: Settings UI -- New "Linting" Tab

Add a new tab to the Settings page called "Linting Rules" with a new component `LintingSettings.tsx`.

**Features:**
- "Fetch Rules" button that calls the edge function to load/refresh available rules from the API
- Rules displayed grouped by category (e.g., "project_settings", "microflows", "domain_model")
- Each rule shows: title, description, severity badge, and an enable/disable toggle
- "Select All" / "Deselect All" per category
- Changes are saved immediately to the database when toggling

**Layout:**
```text
[Linting Rules]

[Fetch Available Rules]    (button to call /policies)

Category: project_settings
  [x] 005_0001 - Rule Title        severity: warning
  [x] 005_0003 - Another Rule      severity: error
  ...

Category: microflows
  [x] 010_0001 - Rule Title        severity: warning
  ...
```

### Step 5: Update Settings Page

Add the new tab to `Settings.tsx`:
- New `TabsTrigger` value "linting" with label "Linting Rules"
- New `TabsContent` rendering the `LintingSettings` component
- Update grid columns from 7 to 8

### Files to Create/Modify

| File | Action |
|------|--------|
| Supabase secrets | Add MENDIX_ANALYZER_API_KEY, MENDIX_ANALYZER_BASE_URL |
| Database migration | Create `linting_policies` table with RLS |
| `supabase/functions/fetch-linting-policies/index.ts` | New edge function calling GET /policies |
| `supabase/config.toml` | Add config for new edge function |
| `src/components/LintingSettings.tsx` | New component for rule management UI |
| `src/pages/Settings.tsx` | Add "Linting Rules" tab |

### How It Connects to the "Run Linting" Button

Once the global rule set is configured here, the "Run Linting" button in AppCard (from the previous change) will be updated to:
1. Read the user's enabled rules from `linting_policies`
2. Pass them as the `policies` array to the Analyzer API's `/analyze-mpr/git` endpoint
3. Store results in `linting_runs` and `linting_results`

This plan focuses only on step 1: fetching and managing the rule set. The actual linting execution will be a separate follow-up.

