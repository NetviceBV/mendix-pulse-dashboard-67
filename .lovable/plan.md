

## Fix Linting Rule Overrides Dialog Layout

### Problems
- Horizontal scrollbar appears because rule rows (rule_id + title + severity badge + overridden badge + toggle) don't wrap and overflow the dialog width
- The vertical scroll area doesn't fit well within the dialog

### Changes

**1. `src/components/AppCard.tsx` (Dialog wrapper)**
- Add `overflow-x-hidden` to the `DialogContent` to prevent horizontal scroll

**2. `src/components/AppLintingOverrides.tsx` (main fix)**
- On each rule row: make the text content wrap instead of using `truncate` on the title
- Change the layout from a single `flex` row to allow wrapping: use `min-w-0` and `flex-wrap` or switch to a stacked layout for the rule info
- Ensure the rule_id `code`, title `span`, and badges wrap naturally within the available space
- Keep the toggle switch pinned to the right with `shrink-0`
- Remove or reduce `gap` values that contribute to overflow
- Change the outer `div` of each rule from `flex items-center` to allow the left content area to shrink and wrap

### Specific CSS fixes in `AppLintingOverrides.tsx`
- Rule row container: add `overflow-hidden` and ensure `min-w-0` on the flex-1 content area
- Inner items row (code + title + badges): change from `flex items-center gap-2` to `flex flex-wrap items-center gap-1.5` so badges wrap to the next line on narrow dialogs
- Remove `truncate` from the title span so text wraps naturally
- Toggle + reset button container: add `shrink-0` to prevent it from being squeezed

