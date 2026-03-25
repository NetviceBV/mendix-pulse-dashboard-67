

## Fix: `updateUser` → `updateUserById` in manage-users

### Problem
The `manage-users` edge function imports `@supabase/supabase-js@2.57.4`. In this version, the admin method to update a user is `updateUserById(userId, attributes)`, not `updateUser(userId, attributes)`.

### Change

**`supabase/functions/manage-users/index.ts`** — line ~169:

Replace:
```typescript
const { error } = await adminClient.auth.admin.updateUser(userId, updatePayload);
```

With:
```typescript
const { error } = await adminClient.auth.admin.updateUserById(userId, updatePayload);
```

One-line fix. No other files affected.

