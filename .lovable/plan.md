

## Fix: Linting Run History List Overflow

### Problem

The left-side run list in the Linting Run History dialog overflows the dialog boundaries. The `ScrollArea` component wrapping the run list has no explicit height, so it expands with its content instead of scrolling.

### Solution

Add a max-height constraint to the run list `ScrollArea` and ensure the flex container properly constrains both panels within the dialog.

### Technical Change

**File: `src/components/LintingRunHistory.tsx`**

1. Add a fixed max-height to the flex container holding both panels (e.g., `max-h-[60vh]`)
2. Ensure the `ScrollArea` on the left properly scrolls within that constraint

Change the flex container (around line 46):
```typescript
// From:
<div className="flex gap-4 min-h-[300px]">

// To:
<div className="flex gap-4 min-h-[300px] max-h-[60vh]">
```

And add a height class to the ScrollArea (around line 48):
```typescript
// From:
<ScrollArea className="w-[220px] shrink-0 border-r pr-3">

// To:
<ScrollArea className="w-[220px] shrink-0 border-r pr-3 h-full">
```

This ensures the run list scrolls within the dialog instead of pushing content outside its boundaries.

