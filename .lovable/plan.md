

## Keep Linting Policies in Sync with Analyzer API

### Problem
When rules are removed from the Analyzer API, they remain in the database as stale entries.

### Solution
After upserting the current rules from the API, delete any rules for this user that were NOT in the API response. This ensures the database is always a mirror of the API's rule set (with user's `is_enabled` preferences preserved for existing rules).

### Technical Details

**File: `supabase/functions/fetch-linting-policies/index.ts`**

After the upsert logic (around line 100, before fetching all policies), add a cleanup step:

```typescript
// Remove rules that no longer exist in the API
const currentRuleIds = rows.map(r => r.rule_id)
if (currentRuleIds.length > 0) {
  const { error: deleteError } = await supabase
    .from('linting_policies')
    .delete()
    .eq('user_id', user.id)
    .not('rule_id', 'in', `(${currentRuleIds.join(',')})`)

  if (deleteError) {
    console.error('Cleanup error:', deleteError)
  }
}
```

This runs after every fetch, so the database always reflects exactly what the API returns. No other files need to change.

