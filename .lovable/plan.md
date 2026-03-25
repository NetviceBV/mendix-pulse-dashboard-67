

## Set Default Mandrill Subaccount to "OPS"

### Change
In `supabase/functions/send-email-mandrill/index.ts`, line 109, change the subaccount fallback from `undefined` to `'OPS'`:

```typescript
subaccount: emailRequest.subaccount || 'OPS',
```

This ensures every email sent through Mandrill uses the "OPS" subaccount by default, unless a different subaccount is explicitly provided in the request.

### Files
- `supabase/functions/send-email-mandrill/index.ts` — one-line change on line 109

