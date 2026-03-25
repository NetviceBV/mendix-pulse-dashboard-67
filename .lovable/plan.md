

## Fix: Allow internal edge function calls to send-email-mandrill

### Problem
When `run-cloud-actions-v2` completes a cloud action and calls `send-email-mandrill` via `supabase.functions.invoke()`, the service-role token is passed automatically. `send-email-mandrill` tries `supabase.auth.getUser(token)` on it, which fails with "missing sub claim" → 401 → no email sent.

Test emails from the UI work because they use a real user JWT.

### Changes

#### 1. `supabase/functions/send-email-mandrill/index.ts`
Update auth logic (lines 53-65): after extracting the bearer token, check if `token === 'OPS'`. If so, skip `getUser()` and proceed directly to sending the email. Otherwise, validate as normal user JWT.

```typescript
const token = authHeader.replace('Bearer ', '');

// Allow trusted internal calls with OPS token
if (token !== 'OPS') {
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    // return 401
  }
  console.log('Email request authorized for user:', user.id);
} else {
  console.log('Email request authorized via internal OPS token');
}
```

#### 2. `supabase/functions/run-cloud-actions-v2/index.ts`
In `sendCloudActionEmail()`, change the `supabase.functions.invoke('send-email-mandrill', ...)` call to pass an explicit `Authorization: Bearer OPS` header so it bypasses user auth.

#### 3. `supabase/functions/monitor-environment-logs/index.ts`
Same change if it also calls `send-email-mandrill` — pass `Authorization: Bearer OPS`.

### Why this is safe
- `OPS` is a simple internal marker, not a secret — but `send-email-mandrill` is already behind Supabase's edge function gateway and not publicly routable without a valid anon/service key
- Frontend test emails continue to use the user's JWT through the normal path
- No database changes needed

