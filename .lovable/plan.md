

## Fix: Parse Correct API Response Structure for Linting Policies

### Problem
The edge function assumes the API returns `{ "category_name": [rules] }` but the actual response is nested differently:
```json
{
  "totalRules": 22,
  "categories": [
    {
      "id": "project_settings",
      "rules": [
        { "id": "001_0001", "title": "...", "description": "...", "severity": "HIGH", "category": "Security" }
      ]
    }
  ]
}
```

### Fix

**File: `supabase/functions/fetch-linting-policies/index.ts`**

Replace the parsing logic (the `for` loop that iterates over `Object.entries(policiesData)`) with correct traversal of the `categories` array:

```typescript
const policiesData = await response.json()
const categories = policiesData.categories || []

const rows = []
for (const cat of categories) {
  const categoryId = cat.id  // e.g. "project_settings"
  for (const rule of (cat.rules || [])) {
    rows.push({
      user_id: user.id,
      rule_id: rule.id,           // e.g. "001_0001"
      category: categoryId,       // e.g. "project_settings"
      title: rule.title,
      description: rule.description || null,
      severity: rule.severity || null,
      is_enabled: true,
    })
  }
}
```

No other files need to change. After deploying, the "Fetch Available Rules" button will correctly parse all 22 rules and display them grouped by category.

