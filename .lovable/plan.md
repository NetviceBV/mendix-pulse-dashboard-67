

## Plan: Remove Redundant localStorage Credential Storage

### Problem Summary
`Settings.tsx` stores Mendix credentials in localStorage (lines 34-50), but credentials are already stored in Supabase via `MendixCredentials.tsx`. This creates:

1. **Data inconsistency**: Credentials updated on one device won't sync to another
2. **Migration loop**: The migration in `MendixCredentials.tsx` deletes localStorage, but `Settings.tsx` immediately recreates it via `handleCredentialsChange`
3. **Security concern**: Sensitive API keys/PATs stored in browser localStorage when Supabase RLS-protected storage is available

### Current Flow (Problematic)

```text
Settings.tsx                          MendixCredentials.tsx
     |                                        |
     |-- Load from localStorage (mount)       |
     |                                        |-- Migrate localStorage → Supabase
     |                                        |-- Delete localStorage
     |                                        |-- Fetch from Supabase
     |                                        |-- Call onCredentialsChange()
     |                                        |
     |<-- handleCredentialsChange() ----------|
     |-- Save back to localStorage! (recreates it)
```

### Solution: Simplify Settings.tsx

Remove the localStorage logic entirely from `Settings.tsx`. The `MendixCredentials` component already:
- Fetches credentials from Supabase on mount
- Handles all CRUD operations against Supabase
- Has one-time migration logic for existing localStorage data

### Changes Required

**File: `src/pages/Settings.tsx`**

| Lines | Current | Change |
|-------|---------|--------|
| 19 | `const [mendixCredentials, setMendixCredentials] = useState<MendixCredential[]>([]);` | Keep as-is (still needed for prop passing) |
| 34-44 | useEffect that loads from localStorage | **Remove entirely** |
| 46-50 | `handleCredentialsChange` that saves to localStorage | **Simplify** to just update state |

**Before:**
```typescript
// Load credentials from localStorage on mount
useEffect(() => {
  const savedCredentials = localStorage.getItem('mendix-credentials');
  if (savedCredentials) {
    try {
      setMendixCredentials(JSON.parse(savedCredentials));
    } catch (error) {
      console.error('Failed to parse saved credentials:', error);
    }
  }
}, []);

// Save credentials to localStorage whenever they change
const handleCredentialsChange = (credentials: MendixCredential[]) => {
  setMendixCredentials(credentials);
  localStorage.setItem('mendix-credentials', JSON.stringify(credentials));
};
```

**After:**
```typescript
// Credentials are managed by MendixCredentials component via Supabase
// State is kept here only for prop drilling
const handleCredentialsChange = (credentials: MendixCredential[]) => {
  setMendixCredentials(credentials);
};
```

### Why This Is Safe

1. **MendixCredentials already handles migration**: Lines 46-81 in `MendixCredentials.tsx` migrate any existing localStorage credentials to Supabase before deleting them
2. **All CRUD goes through Supabase**: `handleAddCredential`, `handleDeleteCredential`, `handleEditCredential` all use `supabase.from('mendix_credentials')`
3. **Initial fetch from Supabase**: `fetchCredentials()` is called on component mount (line 106-108)

### Migration Path for Existing Users

Users with credentials in localStorage will have them automatically migrated:
1. `MendixCredentials.tsx` mount triggers migration useEffect
2. Credentials are inserted into Supabase
3. localStorage is cleared
4. Fresh fetch from Supabase populates the UI

### Impact

| Aspect | Before | After |
|--------|--------|-------|
| Data source | Dual (localStorage + Supabase) | Single (Supabase only) |
| Cross-device sync | Broken | Works via Supabase |
| Security | API keys in localStorage | API keys in RLS-protected database |
| Migration | Broken (recreated after delete) | Works correctly |

