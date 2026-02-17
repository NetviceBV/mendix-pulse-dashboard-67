
## Strip Redundant Prefix from Violation Messages

### Problem

Each violation message stored in the database starts with a redundant prefix like `[MEDIUM, Maintainability, 005_0003]` followed by the actual message. Since the rule name, severity, and chapter are already displayed in the rule row header, this prefix wastes space and makes messages harder to read.

Current: `[MEDIUM, Maintainability, 005_0003] Microflow PostGetWorkDaysInfo has 36 actions which is more than 30 erik`
Desired: `Microflow PostGetWorkDaysInfo has 36 actions which is more than 30 erik`

### Fix

Strip the `[...] ` prefix when collecting violation messages in the edge function.

### Technical Change

**`supabase/functions/run-linting-checks/index.ts`** (line 206)

Change the message push to strip the leading bracket prefix:

```typescript
// Before:
violatedRules.get(key)!.push(v.message || '')

// After:
const msg = (v.message || '').replace(/^\[.*?\]\s*/, '')
violatedRules.get(key)!.push(msg)
```

This regex removes everything from the start up to and including the first `]` plus any trailing space, leaving just the meaningful part of the message.

No UI changes needed -- the `LintingDetailsDialog` already displays the messages cleanly. After this fix and a re-run, all violations will show clean messages like "Microflow ChangeStatuswijzigingVoorBellijstCheck has 53 actions which is more than 30 erik".
