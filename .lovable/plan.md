

## Improve Violation Details Readability

### Problem

When a rule has many violations (e.g., 50+ microflows exceeding 30 actions), they are currently crammed into a small `<pre>` block with a 200px max height inside the chapter dialog. This makes it hard to read and navigate through the list.

### Solution

Replace the raw `<pre>` block with a structured, searchable list view inside an expanded dialog:

1. **Widen the details dialog** from `max-w-lg` to `max-w-2xl` so there is more room
2. **Replace the `<pre>` block** with a proper table/list where each violation is its own row, making them individually scannable
3. **Add a search/filter box** above the violations list so users can quickly find specific microflow names
4. **Increase the scroll area** from 200px to 400px max height for the violations list
5. **Show violation count prominently** in a badge next to the rule name (e.g., "36 violations")

### Technical Changes

**`src/components/LintingDetailsDialog.tsx`**

- Change `max-w-lg` to `max-w-2xl` on `DialogContent` (line 25) for more horizontal space
- In the `RuleRow` component, replace the `<pre>` block (lines 131-134) with a structured list:
  - Split `rule.details` by newline into individual violation items
  - Render each as a separate row with alternating background for readability
  - Each row shows the violation message in a clean, readable format
- Add a local search `<Input>` above the violations list that filters items by text
- Increase `max-h-[200px]` to `max-h-[400px]` on the violations ScrollArea
- Keep the copy-to-clipboard button (copies all violations)

### What the user will see

```text
005_0003 - Microflows should not exceed 30 actions    [error]  [36 violations]
                                                               [v chevron]
  Search violations...  [_______________]               [copy icon]

  | Microflow PostGetWorkDaysInfo has 36 actions which is more than 30   |
  | Microflow ACT_ProcessOrder has 42 actions which is more than 30     |
  | Microflow SUB_ValidateInput has 31 actions which is more than 30    |
  | ...                                                                  |
```

### Edge function fix (prerequisite)

The `run-linting-checks` edge function must also be updated to collect all violations per rule (not just the last one). This was identified in the previous conversation:

- Change `violatedRules` from `Map<string, string>` to `Map<string, string[]>` to accumulate all messages
- Join them with newlines when storing in the `details` column

Both changes (edge function + UI) will be implemented together.

