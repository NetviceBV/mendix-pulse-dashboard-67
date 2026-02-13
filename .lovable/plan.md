

## Add Rule Descriptions to Linting Rule Overrides

### Change

In `src/components/AppLintingOverrides.tsx`, add a line below the rule title/badges row to display `rule.description` when it exists -- matching the same pattern already used in the global `LintingSettings.tsx` component.

### Technical Detail

**File: `src/components/AppLintingOverrides.tsx`** (single change, around line 262)

After the closing `</div>` of the flex-wrap row (line 262), add:

```tsx
{rule.description && (
  <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
)}
```

This mirrors the exact pattern from `LintingSettings.tsx` (line 173-175) for consistency.

