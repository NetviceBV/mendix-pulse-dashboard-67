

## Plan: Mendix Linting Feature - UI Architecture Design

### Current App Card Layout

Each `AppCard` currently shows:
1. App header (name, version, status)
2. **OWASP Top 10 grid** (2-column grid of 10 status tiles with a "Run Checks" button)
3. **Environment collapsibles** (with logs, microflows, vulnerability scan actions)

### Linting Data Structure

Linting results are hierarchical:

```text
App
  +-- Chapter: Project Settings
  |     +-- Rule: EmptyStringCheckNotComplete (pass/fail)
  |     +-- Rule: SomeOtherRule (pass/fail)
  +-- Chapter: Domain Model
  |     +-- Rule: ...
  +-- Chapter: Modules
  +-- Chapter: Pages
  +-- Chapter: Microflows
```

This differs from OWASP which is a flat list of 10 items. Linting has **chapters as categories** with **many rules per chapter**.

---

### Proposed UI: Tabbed Security Section in AppCard

Instead of stacking OWASP and Linting vertically (which would make the card very tall), use **tabs** within the existing security section:

```text
+-------------------------------------------+
| App Name                          v1.2.3  |
+-------------------------------------------+
| [OWASP Top 10] [Linting]     [Run Checks] |
|                                            |
|  (tab content here)                        |
|                                            |
+-------------------------------------------+
| > Sandbox  v1.2.3          Running        |
| > Test     v1.2.3          Stopped        |
| > Production v1.2.3        Running        |
+-------------------------------------------+
```

#### OWASP Tab (existing, unchanged)
The current 2-column grid of A01-A10 status tiles.

#### Linting Tab (new)
Shows chapters as compact rows with aggregate pass/fail counts:

```text
+-------------------------------------------+
| Chapter              Rules   Pass   Fail  |
|-------------------------------------------|
| Project Settings      8/8     8      0   [green] |
| Domain Model          5/7     5      2   [red]   |
| Modules              12/12   12      0   [green] |
| Pages                 9/10    9      1   [yellow]|
| Microflows            6/8     6      2   [red]   |
+-------------------------------------------+
| Total: 40/45 rules passed (89%)           |
+-------------------------------------------+
```

Clicking a chapter row opens a **Linting Details Dialog** showing all rules within that chapter:

```text
+--------------------------------------------------+
| Domain Model - Linting Rules            [x close] |
|--------------------------------------------------|
| [pass] EntityNamingConvention                     |
|        Entity names should follow PascalCase      |
|                                                   |
| [fail] EmptyStringCheckNotComplete                |
|        All string attributes should have...       |
|        Details: Found 3 entities with empty...    |
|                                                   |
| [pass] AssociationNaming                          |
|        Associations should be named...            |
|                                                   |
| [fail] UnusedEntities                             |
|        Remove entities that are not referenced... |
|        Details: Entity 'TempData' is unused       |
+--------------------------------------------------+
```

---

### Database Schema (New Tables)

**`linting_runs`** - Tracks each linting execution per app

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| app_id | text | Mendix project ID |
| status | text | running, completed, failed |
| total_rules | integer | Total rules checked |
| passed_rules | integer | Rules that passed |
| failed_rules | integer | Rules that failed |
| started_at | timestamp | Run start time |
| completed_at | timestamp | Run completion time |

**`linting_results`** - Individual rule results per run

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| run_id | uuid | FK to linting_runs |
| app_id | text | Mendix project ID |
| chapter | text | Category (Project Settings, Domain Model, etc.) |
| rule_name | text | Rule identifier (EmptyStringCheckNotComplete) |
| rule_description | text | Human-readable description |
| status | text | pass, fail, warning |
| details | text | Failure details/context |
| severity | text | error, warning, info |
| checked_at | timestamp | When this rule was evaluated |

---

### Component Architecture

| Component | Purpose |
|-----------|---------|
| `AppCard.tsx` (modified) | Add Tabs wrapping OWASP grid and new Linting section |
| `LintingChapterGrid.tsx` (new) | Chapter summary rows with pass/fail counts |
| `LintingDetailsDialog.tsx` (new) | Rule-level details for a chapter |
| `useLintingQuery.ts` (new) | React Query hook for fetching linting results |

---

### Integration with Existing API

The linting API call would be triggered similarly to OWASP checks:
- A "Run Linting" button (or shared "Run Checks" button covering both)
- An edge function (`run-linting-checks`) that calls your external linting API
- Results stored in `linting_results` table
- React Query hook fetches and caches results per app

---

### Key Design Decisions

1. **Tabs vs. Stacking**: Tabs keep the card compact. Users toggle between OWASP and Linting without scrolling.

2. **Chapter-level summary in card, rule-level in dialog**: Keeps the card scannable while allowing deep-dive via click.

3. **Separate from OWASP**: Linting and OWASP serve different purposes (code quality vs. security). Separate tabs + separate database tables keeps them cleanly decoupled.

4. **Progress bar**: A small progress bar or percentage indicator gives instant visual feedback on overall linting health.

5. **Run history**: The `linting_runs` table enables showing "last run" timestamps and comparing results over time (future enhancement).

---

### Summary

The recommended approach is:
- **Tabbed UI** in AppCard: `[OWASP Top 10] [Linting]`
- **Chapter-level summaries** as compact rows with pass/fail counts
- **Click-to-expand** details dialog showing individual rules per chapter
- **Dedicated database tables** for linting runs and results
- **React Query hook** for data fetching with caching
- **Edge function** to call your external linting API

This keeps the UI consistent with existing patterns while accommodating the hierarchical nature of linting rules. Would you like to proceed with implementing this architecture?

