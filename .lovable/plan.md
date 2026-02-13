

## Sort Linting Rules by Directory (A-Z)

### What Changes
The API response includes a `directory` field per category (e.g., `001_project_settings`, `002_domain_model`) which provides a natural sort order. We'll store this field and use it for sorting.

### Steps

1. **Add `directory` column to `linting_policies` table**
   - Run migration: `ALTER TABLE linting_policies ADD COLUMN directory text;`

2. **Update edge function to store `directory`**
   - In `supabase/functions/fetch-linting-policies/index.ts`, add `directory: cat.directory` to each row in the parsing loop
   - Update the final query to order by `directory` then `rule_id`

3. **Update frontend sorting**
   - In `src/components/LintingSettings.tsx`, the grouped categories are currently sorted alphabetically by category name. Update to sort by `directory` instead, so categories appear in the correct numeric order (001, 002, 003...).

### Result
Categories will display in order: Project Settings, Domain Model, Modules, Pages, Microflows, Custom -- matching the API's directory numbering.

