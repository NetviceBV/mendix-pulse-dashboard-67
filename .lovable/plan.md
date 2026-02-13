

## Plan: Fix Duplicate Credentials and Prevent Future Duplicates

### Root Cause

The `MendixCredentials.tsx` component has a `useEffect` that migrates credentials from `localStorage` to the database. This migration logic has a race condition: it checks `credentials.length === 0` but the parent component's state hasn't been updated yet when React Query data arrives, causing it to run multiple times and insert duplicates.

Additionally, the component does direct Supabase inserts alongside React Query, creating a dual-write pattern that can produce duplicates.

### What Happened

- Your user (`fa7cf1c9-...`) has 4 credentials: 1 original "Erik" from September and 3 duplicates of "Erik 2" created today
- Two duplicates were created at the exact same second, confirming a re-render triggered duplicate inserts

### OWASP Settings Status

Your OWASP items (A01-A10) are all present and correct. The "empty" appearance is because most categories have no validation steps configured yet (only A01 has 1 step: "Check public endpoints"). This is not a data loss issue -- it matches your screenshot.

### Fix Steps

#### 1. Clean up duplicate credentials (database)

Delete the 2 duplicate "Erik 2" entries, keeping only the oldest one:

```sql
DELETE FROM mendix_credentials
WHERE id IN (
  'e9cad285-4b3e-4300-8b40-bc5674e74f11',
  'b052d186-d288-44a8-8b43-ef5739db8000'
);
```

This leaves you with the original "Erik" and one "Erik 2".

#### 2. Remove the localStorage migration code from MendixCredentials.tsx

The migration `useEffect` (lines ~63-92) is no longer needed -- credentials are already stored in Supabase. Remove it entirely to prevent future duplicate inserts.

#### 3. Add a unique constraint to prevent duplicates at the database level

Add a unique constraint on `(user_id, name, username)` to the `mendix_credentials` table so the database itself rejects duplicate entries.

### Files to Modify

| File | Change |
|------|--------|
| Database | Delete 2 duplicate credential rows |
| Database | Add unique constraint on mendix_credentials |
| `src/components/MendixCredentials.tsx` | Remove localStorage migration useEffect |

### Technical Notes

- The `useCredentialsQuery` hook already handles data fetching via React Query, so the migration code is redundant
- The unique constraint uses `(user_id, name, username)` since a user shouldn't have two credentials with the same name and username
