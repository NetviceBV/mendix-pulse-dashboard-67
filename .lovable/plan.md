

## Move Linting History and Settings Inside the Tab

### Problem
The history (clock) and settings (gear) icons are currently in the shared header bar next to the tab triggers. This puts them outside the Linting tab content, which is confusing -- they appear at the same level as the tab selector and the "Run Linting" button.

### Solution
Move the history and settings buttons into the Linting tab content area, so they only appear when the Linting tab is active and feel like part of that tab's UI.

### Changes (single file: `src/components/AppCard.tsx`)

**1. Remove the conditional linting buttons from the shared header (lines 754-763)**
- Delete the block that renders the History and Settings2 buttons conditionally when `activeSecurityTab === "linting"`

**2. Add a small toolbar row inside the Linting TabsContent (line 841)**
- Inside `<TabsContent value="linting">`, add a row above the `LintingChapterGrid` with the history and settings buttons aligned to the right
- Layout:
```
+----------------------------------------------+
| [chapter grid results]                       |
|                                              |
| [History] [Settings]    (bottom or top row)  |
+----------------------------------------------+
```
- Specifically, add a `div` with `flex items-center justify-end gap-1.5 mb-2` containing the two icon buttons, placed before the `LintingChapterGrid`

### Technical Detail

The `Run Linting` button stays in the shared header since it mirrors the `Run OWASP` button position -- both action buttons share the same spot. Only the history/settings icons move inside.

**Before (header):**
```
[OWASP Top 10] [Linting]   [clock] [gear] [Run Linting]
```

**After (header):**
```
[OWASP Top 10] [Linting]                  [Run Linting]
```

**After (inside linting tab content):**
```
                              [clock] [gear]
[Chapter Grid results...]
```

