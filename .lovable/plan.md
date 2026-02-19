## Version-Based Git/SVN Selection for Linting

### Problem

The `run-linting-checks` edge function currently decides between Git and SVN based solely on whether a PAT exists. This is unreliable -- an MX9 project with a PAT would incorrectly try Git first.

### Solution

Look up the app's version from `mendix_apps` and use it to pick the right API. The key insight: if the version contains a git hash (6+ hex characters at the end), the project uses Git. Otherwise it uses SVN. However, MX9 projects can sometimes also have a git hash -- in that case, still use Git since the repo is Git-accessible.

**Decision logic:**

- Version has a git hash AND PAT exists --> use Git endpoint (with SVN fallback)
- Version has no git hash (pure numeric like `1.1.1234`) --> use SVN endpoint directly
- No version found --> fall back to current behavior (try Git if git fails try SVN)
  &nbsp;

### Technical Changes

**File: `supabase/functions/run-linting-checks/index.ts**`

1. **Add version lookup** after fetching the credential (after line 69):
  ```typescript
   const { data: appRow } = await supabase
     .from('mendix_apps')
     .select('version')
     .eq('project_id', appId)
     .eq('user_id', user.id)
     .single();
  ```
2. **Add helper function** to detect git-based versions:
  ```typescript
   function hasGitHash(ver?: string): boolean {
     if (!ver) return false;
     return /[a-f0-9]{6,}$/i.test(ver);
   }
  ```
3. **Replace the Git/SVN decision logic** (lines 136-208). Instead of checking `credential.pat`, use version-based detection:
  - If `hasGitHash(appRow?.version)` AND `credential.pat` --> try Git first, fall back to SVN
  - If no git hash (MX9 numeric version) --> go straight to SVN
  - Add logging: `App version: X, git-based: Y, using: Z`
4. **Keep the existing SVN fallback** if Git fails -- this safety net remains unchanged.

### No Other Files Affected

This is entirely within the `run-linting-checks` edge function. No frontend or database changes needed.