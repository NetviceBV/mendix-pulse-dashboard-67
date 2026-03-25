

## Fix: manage-users Edge Function Error on Update

### Problem
The `manage-users` edge function has no `console.log` statements, making it impossible to see what happens during request processing. The logs only show "booted" messages. This means any error (auth failure, role insert issue, etc.) is invisible.

### Root Cause (Likely)
The function works for `list` (users load fine), but fails on `update`. The most probable cause is that when updating a user's role, the `insert` on line 164 passes a plain string (`"admin"` or `"user"`) to the `role` column which uses the `app_role` enum type. While this typically works, if there's any casting issue it would fail silently since there's no logging.

### Changes

#### 1. `supabase/functions/manage-users/index.ts` — Add logging + fix potential issues
- Add `console.log` statements at key points: action received, auth verified, role check, update processing, role update
- Cast the role value explicitly when inserting into `user_roles`
- Improve error details in catch block

Key additions:
```typescript
// After parsing body (line 63):
console.log(`Action: ${action}, userId: ${userId}, role: ${role}`);

// Before role delete/insert (line 160):
console.log(`Updating role for ${userId} to ${role}`);

// After role insert:
console.log(`Role updated successfully`);

// In catch block (line 212):
console.error('manage-users error:', err.message, err.stack);
```

#### 2. No client-side changes needed
The `EditUserDialog.tsx` error handling is correct — it catches both `error` from invoke and `data.error` from the response body.

### Files
- `supabase/functions/manage-users/index.ts` — add console.log throughout + ensure robust error handling

