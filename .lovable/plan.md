

## Implement Linting Check Execution

### Overview
Replace the placeholder "coming soon" toast with actual linting execution via a new edge function that calls the Mendix Analyzer API.

### SVN vs Git Detection
The user clarified: try Git endpoint first (`/analyze-mpr/git`), and if it fails, retry with SVN (`/analyze-mpr/svn`). This avoids needing to determine the Mendix version upfront.

### Changes

**1. New edge function: `supabase/functions/run-linting-checks/index.ts`**

Accepts POST with `{ credentialId, appId }` (appId = Mendix project ID).

Steps:
1. Authenticate user via JWT
2. Fetch credential from `mendix_credentials` by `credentialId`
3. Collect enabled rule IDs:
   - Query `linting_policies` where `user_id` matches and `is_enabled = true`
   - Query `linting_policy_overrides` for this `appId` to apply per-app overrides (override `is_enabled` takes precedence)
   - Build final list of rule_id strings (e.g. `["001_0001", "002_0003"]`)
4. Create a `linting_runs` row with status `"running"`
5. Try Git endpoint first:
   - POST to `{MENDIX_ANALYZER_BASE_URL}/analyze-mpr/git` with body `{ projectId, username, pat, reportFormat: "json", policies: [...] }`
   - If `pat` is empty/null, or if the call returns an error, fall back to SVN
6. SVN fallback:
   - POST to `{MENDIX_ANALYZER_BASE_URL}/analyze-mpr/svn` with body `{ projectId, username, password: api_key, reportFormat: "json", policies: [...] }`
7. Parse the response:
   - Map each item in `rules[]` to a `linting_results` row
   - Determine pass/fail by checking if the rule's `ruleNumber` appears in `violations[]`
   - Extract chapter from the rule's path directory prefix (e.g. `001_project_settings`)
   - Store: `rule_name` = title, `rule_description` = description, `severity`, `status` = "pass"/"fail", `details` = violation message if failed, `chapter` = category/directory
8. Update `linting_runs` with `passed_rules`, `failed_rules`, `total_rules`, status `"completed"`, and `completed_at`
9. On any error, update `linting_runs` to status `"failed"`

Authentication header for Analyzer API: `X-API-Key: {MENDIX_ANALYZER_API_KEY}` (matching the pattern in `fetch-linting-policies`).

**2. Update `supabase/config.toml`**

Add:
```toml
[functions.run-linting-checks]
verify_jwt = false
```

**3. Update `src/components/AppCard.tsx`**

- Add `runningLintingChecks` state (boolean)
- Replace `handleRunLintingChecks` placeholder with:
  - Call the `run-linting-checks` edge function with `credentialId` and `appId` (project_id)
  - Show loading spinner on the Run Linting button while running
  - On success: show success toast, invalidate linting queries to refresh results
  - On failure: show error toast
- Disable the Run Linting button while `runningLintingChecks` is true

### Response-to-Database Mapping

| API Response Field | DB Column (`linting_results`) |
|---|---|
| `rules[].title` | `rule_name` |
| `rules[].description` | `rule_description` |
| `rules[].severity` | `severity` |
| `rules[].ruleNumber` in `violations[]`? | `status` ("fail" / "pass") |
| `violations[].message` | `details` (when failed) |
| directory from rule path | `chapter` |

| API Response Field | DB Column (`linting_runs`) |
|---|---|
| `summary.passed` | `passed_rules` |
| `summary.failed` | `failed_rules` |
| `summary.total` | `total_rules` |

