

## Fix: Persistent Bracketed Prefixes in Linting Violations

### Problem

Despite updating the regex in the linting webhook, the latest run still contains violation messages with `[MEDIUM, Microflows, 999_0001]` prefixes. The deployed edge function may not have picked up the code change.

### Solution (Two-Pronged)

Apply the fix at **both** the storage layer and the display layer for maximum reliability.

**1. Redeploy the `linting-webhook` edge function**

Force a fresh deployment to ensure the updated regex `^(\[.*?\]\s*)+` is actually running.

**2. Add UI-side stripping in `LintingDetailsDialog.tsx`**

As a safety net, also strip bracketed prefixes when displaying violation messages. This handles both old stored data and any edge case where the webhook regex doesn't catch everything.

### Technical Changes

**File: `src/components/LintingDetailsDialog.tsx`**

In the `RuleRow` component, when splitting violation details into display items, apply the same bracket-stripping regex:

```typescript
// Current (line ~57):
const allItems = hasDetails ? rule.details!.split("\n").filter(Boolean) : [];

// Updated:
const allItems = hasDetails
  ? rule.details!.split("\n").filter(Boolean).map(item => item.replace(/^(\[.*?\]\s*)+/, ''))
  : [];
```

**File: `supabase/functions/linting-webhook/index.ts`**

No code change needed (already updated) -- just a forced redeployment to ensure the latest version is live.

### Why Both?

- The webhook fix prevents brackets from being stored in future runs
- The UI fix cleans up any existing stored data AND acts as a fallback if the webhook ever misses something
- This ensures a clean display regardless of when the data was written

