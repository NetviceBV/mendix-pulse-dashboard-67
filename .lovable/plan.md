

## Plan: Tab-Aware "Run Checks" Button

### Problem
The "Run Checks" button currently sits outside the tabs and always triggers OWASP checks, regardless of which tab (OWASP or Linting) is selected.

### Solution
Track the active tab and make the "Run Checks" button context-aware -- it runs OWASP checks when on the OWASP tab and linting checks when on the Linting tab.

### Changes (single file: `src/components/AppCard.tsx`)

**1. Add active tab state**
Add a new state variable to track which tab is selected:
```typescript
const [activeSecurityTab, setActiveSecurityTab] = useState("owasp");
```

**2. Make Tabs controlled**
Change from `defaultValue="owasp"` to `value={activeSecurityTab}` with `onValueChange={setActiveSecurityTab}`.

**3. Create a linting run handler**
Add `handleRunLintingChecks` function (placeholder that shows a toast for now, since the linting edge function hasn't been built yet):
```typescript
const handleRunLintingChecks = async () => {
  toast({
    title: "Run Linting",
    description: "Linting check execution coming soon...",
  });
};
```

**4. Update the Run Checks button**
Make the button's `onClick`, `disabled` state, and label respond to `activeSecurityTab`:
- OWASP tab: calls `handleRunOwaspChecks` (existing behavior)
- Linting tab: calls `handleRunLintingChecks`

The button label will show "Run OWASP" or "Run Linting" so the user always knows what will happen when they click.

### Visual Result

```text
[OWASP Top 10] [Linting]          [Run OWASP]
  (owasp grid content)

-- or when Linting tab is active --

[OWASP Top 10] [Linting]          [Run Linting]
  (linting chapter grid)
```

### Technical Details

| What | Detail |
|------|--------|
| File modified | `src/components/AppCard.tsx` |
| New state | `activeSecurityTab` (string) |
| New function | `handleRunLintingChecks` (placeholder) |
| Lines affected | ~729-759 (tabs + button area) |

This is a small, focused change -- just wiring the button to the active tab. The actual linting edge function integration can be added later when the API details are provided.

