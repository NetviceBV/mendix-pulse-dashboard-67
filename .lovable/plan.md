

## Fix: Preserve `is_enabled` state when fetching rules

### Problem

When you click "Fetch Available Rules", the `fetch-linting-policies` edge function uses Supabase `upsert` with `is_enabled: true` for every rule. Since upsert updates ALL columns on conflict (including `is_enabled`), every rule gets reset to enabled -- even ones you previously disabled.

The code has a comment acknowledging this ("Supabase upsert will update all columns on conflict, so we need a different approach"), but the fallback logic only runs when the upsert itself errors out, which it doesn't -- it succeeds and overwrites your settings.

### Solution

Replace the upsert with explicit check-then-insert/update logic for every rule:

- **Existing rules**: Update only metadata fields (`category`, `title`, `description`, `severity`, `directory`) -- leave `is_enabled` untouched
- **New rules**: Insert with `is_enabled: true` (default)

### Technical Changes

**`supabase/functions/fetch-linting-policies/index.ts`**

Replace the upsert block (lines 96-131) with:

1. Fetch all existing rule IDs for this user in one query
2. Split rows into "existing" and "new" lists
3. For existing rules: batch update metadata only (no `is_enabled`)
4. For new rules: batch insert with `is_enabled: true`

This is efficient (2-3 queries instead of N individual queries) and guarantees user toggle choices are never overwritten.

