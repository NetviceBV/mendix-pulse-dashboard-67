

## Fix: All 64 violations visible but only 13 showing

### Problem

The violations list uses nested Radix `ScrollArea` components with `max-h` constraints. Radix ScrollArea requires a definite height to calculate its scrollbar — `max-h` alone causes the content to overflow and get clipped without a scrollbar appearing.

### Solution

Replace the inner `ScrollArea` with a plain `div` using `overflow-y-auto` and `max-h-[400px]`. This uses native browser scrolling which works reliably with `max-h`. The outer dialog `ScrollArea` stays as-is since it wraps all rules.

### Technical Changes

**`src/components/LintingDetailsDialog.tsx`**

Line 153: Change the inner ScrollArea to a native scrollable div:

```tsx
// Before
<ScrollArea className="max-h-[400px]">

// After
<div className="max-h-[400px] overflow-y-auto">
```

And the matching closing tag (line ~163):
```tsx
// Before
</ScrollArea>

// After
</div>
```

Remove `ScrollArea` from the imports if no longer used elsewhere in the file (it is still used on line 35 for the outer scroll, so keep the import).

This is a one-line fix that ensures all 64 violations are scrollable.

