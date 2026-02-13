
## Redesign Linting UI: Results in Card, History, and Details Viewer

### Overview

Rethink the linting tab in the AppCard to have three clear layers:

1. **Card view** -- shows the latest run's chapter summaries (compact) with one gear icon for overrides
2. **Run history** -- a list of past runs with date, pass/fail counts, accessible from the card
3. **Details view** -- when clicking a chapter or run, show individual rule results with expandable details for long content

### Current Problems to Solve
- The `AppLintingOverrides` component takes up too much space inline in the card
- No run history -- only the latest run is visible
- Long `details` fields (100s of lines) are shown as a single `<p>` block which is hard to read

---

### 1. Card View (Linting Tab in AppCard)

**Keep**: Chapter grid showing categories with pass/fail counts (existing `LintingChapterGrid`)

**Add**: A single gear icon button in the tab header (next to "Run Linting" button) that opens a Dialog with the full `AppLintingOverrides` component

**Add**: A small "History" button (clock icon) that opens a dialog showing past runs

**Remove**: The inline `<AppLintingOverrides>` below the chapter grid (line 834)

Layout of the linting tab header:
```text
[Linting tab]                    [clock] [gear] [Run Linting]
```

**Files changed:**
- `src/components/AppCard.tsx` -- remove inline `AppLintingOverrides`, add gear icon opening a Dialog with overrides, add history button

---

### 2. Run History Dialog (new component)

**New component: `LintingRunHistory.tsx`**

- Fetches all `linting_runs` for the app (not just the latest)
- Shows a scrollable list of runs with: date/time, status, passed/failed/total counts, a progress bar
- Clicking a run loads its results and shows the chapter grid for that specific run
- The currently-viewed run is highlighted

**Data**: Uses `useLintingRunsQuery` (new hook or extend existing) to fetch multiple runs ordered by `started_at desc`

**UI**: Dialog with a two-panel layout:
- Left: list of runs (date + summary)
- Right: chapter grid for the selected run (reuses `LintingChapterGrid`)

Or simpler: a list of runs, clicking one expands/navigates to its chapter details.

---

### 3. Details View for Long Results

**Problem**: The `details` field can be 100s of lines (e.g., list of all microflows violating a rule). Currently shown as a single `<p>` with `font-mono`.

**Solution**: Enhance `LintingDetailsDialog` (the chapter drill-down):

- **Collapsed by default**: For failed/warning rules, show just the rule name + status. Click to expand.
- **Expandable details**: Use a `Collapsible` component for each rule's details section
- **Scrollable details block**: Wrap long details in a `ScrollArea` with a max height (e.g., 200px)
- **Line count indicator**: Show "42 items found" above the details block so users know the scope before expanding
- **Copy button**: Add a copy-to-clipboard button on the details block so users can paste into their IDE

**Files changed:**
- `src/components/LintingDetailsDialog.tsx` -- add Collapsible for details, ScrollArea, copy button, line count

---

### Technical Details

#### AppCard.tsx changes
- Remove `<AppLintingOverrides appId={app.app_id} appName={app.app_name} />` from line 834
- Add a gear icon `<Button>` next to the "Run Linting" button that opens a `<Dialog>` containing `<AppLintingOverrides>`
- Add a clock icon `<Button>` that opens `<LintingRunHistory>`

#### New: `src/components/LintingRunHistory.tsx`
- Props: `appId`, `open`, `onOpenChange`
- Fetches runs: `SELECT * FROM linting_runs WHERE app_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT 20`
- Each run row shows: date, status badge, "passed/total" count, progress bar
- Clicking a run fetches its results and shows the chapter breakdown in a nested view
- Clicking a chapter in the nested view opens the existing `LintingDetailsDialog`

#### Enhanced: `src/components/LintingDetailsDialog.tsx`
- Each `RuleRow` with status != "pass" gets a `Collapsible` wrapper
- The details block is wrapped in `<ScrollArea className="max-h-[200px]">`
- A line/item count is shown: parse details by newlines to count items
- A "Copy" button in the top-right of the details block
- Passed rules stay compact (no collapsible needed)

#### Hook changes: `src/hooks/useLintingQuery.ts`
- Add a new `useLintingRunsQuery(appId)` export that fetches multiple runs (without results) for the history view
- Keep existing `useLintingQuery` for the latest run in the card

### Summary of Changes

| File | Action |
|------|--------|
| `AppCard.tsx` | Remove inline overrides, add gear + history buttons |
| `LintingRunHistory.tsx` | New component for run history dialog |
| `LintingDetailsDialog.tsx` | Add collapsible details, scroll area, copy button |
| `useLintingQuery.ts` | Add `useLintingRunsQuery` hook |
