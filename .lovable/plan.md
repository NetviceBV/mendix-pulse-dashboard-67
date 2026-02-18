

## Fix: Strip All Bracketed Prefixes from Linting Violation Messages

### Problem

As visible in the screenshot, some violation messages still display bracketed metadata like `[MEDIUM, Microflows, 999_0001]` before the actual message text. The current regex only removes the first `[...]` group, so when a message has multiple leading brackets or when one bracket group remains after stripping, it shows through in the UI.

### Solution

Update one line in the linting webhook to use a regex that removes **all** consecutive leading `[...]` groups.

### Technical Change

**File: `supabase/functions/linting-webhook/index.ts`** (line 85)

Replace:
```typescript
const msg = (v.message || '').replace(/^\[.*?\]\s*/, '')
```

With:
```typescript
const msg = (v.message || '').replace(/^(\[.*?\]\s*)+/, '')
```

The `()+` quantifier matches one or more consecutive `[...]` blocks at the start, stripping them all in one pass.

### Example

- Input: `[MEDIUM, Microflows, 999_0001] Microflow 'OnClickDossierAfhandelen' has unused parameter 'FoutieveTerugbelafspraakLoggingHelper'`
- Output: `Microflow 'OnClickDossierAfhandelen' has unused parameter 'FoutieveTerugbelafspraakLoggingHelper'`

### Deployment

The `linting-webhook` edge function will be redeployed. Only future linting runs are affected -- existing stored results remain unchanged (you would need to re-run linting to get clean messages for those).
