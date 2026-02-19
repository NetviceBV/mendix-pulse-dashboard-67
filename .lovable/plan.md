

## Fix: Redeploy run-linting-checks Edge Function

### Problem
The version-refresh code is present in the source file but the **deployed** edge function is still running the old code. The logs clearly show:
- `App version: 1.0.0` with no refresh attempt logged
- No "Refreshed app version", "Version refresh API returned", or "Version refresh failed" log lines appear

This means the previous deployment did not succeed or was not picked up.

### Solution
Force a redeployment of both modified edge functions:

1. **`run-linting-checks`** - Contains the version-refresh logic that should call the Mendix API before routing
2. **`linting-webhook`** - Should also be redeployed to ensure consistency

No code changes are needed — the source files already contain the correct logic. This is purely a deployment action.

### After Deployment
Run linting on "Prikkl Backoffice" again. The logs should now show one of:
- `Refreshed app version to: <real version>` (success - version fetched and Git routing used)
- `Version refresh API returned <status>` (API call failed - need to check credentials)
- `Version refresh failed` (network error)

### Additional Diagnostic Step
If the version refresh succeeds but the analyzer still fails, the `linting-webhook` logs will show "No mxlint data" again. At that point, implementing the error_message column plan (logging the full webhook payload) would be the next step to understand what the analyzer is returning.

