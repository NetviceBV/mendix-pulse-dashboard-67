

## Add Mendix Password Field to Credentials

### What Changes
A new `password` field will be added to Mendix credentials. This is the Mendix account password used specifically for SVN authentication (the linting analyzer's SVN endpoint). Currently, the SVN endpoint incorrectly sends `api_key` as the password.

### Changes Required

**1. Database Migration**
- Add a `password` column (text, nullable) to the `mendix_credentials` table
- Nullable so existing credentials continue to work without requiring immediate updates

**2. Frontend - `src/components/MendixCredentials.tsx`**
- Add a `password` field to the add/edit forms (with a Lock icon, type="password")
- Update the `MendixCredential` interface to include `password?: string`
- Update all state objects (`newCredential`, `editCredential`) to include `password`
- Update insert/update/edit handlers to include the password field
- Password is optional -- validation will not require it (unlike name, username, api_key, pat)

**3. Credentials Query Hook - `src/hooks/useCredentialsQuery.ts`**
- No changes needed -- it uses `select('*')` so the new column will be included automatically

**4. Edge Function - `supabase/functions/run-linting-checks/index.ts`**
- Update the SVN endpoint call to use `credential.password` instead of `credential.api_key` as the password field
- Add a fallback: if `password` is not set, fall back to `credential.api_key` for backward compatibility

**5. Supabase Types - `src/integrations/supabase/types.ts`**
- Add `password` to the `mendix_credentials` table type definitions (Row, Insert, Update)

### No Other Edge Functions Affected
The Mendix Deploy API endpoints (start/stop/fetch/download) use `Mendix-ApiKey` header authentication, which is separate from the SVN password. Only the Railway linting analyzer SVN call uses a password field.

