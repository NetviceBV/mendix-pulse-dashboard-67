

## Add "Reset Templates" Button to EmailTemplates

### Problem
Production has corrupted/incorrect email templates. Need a button to delete all existing templates and recreate the correct defaults.

### Changes

#### `src/components/EmailTemplates.tsx`
1. Add a `resetTemplates` function that:
   - Deletes ALL rows from `email_templates` for the current user
   - Calls `createDefaultTemplates()` to recreate from `DEFAULT_TEMPLATES`
   - Shows success toast
2. Add a destructive button with confirmation (using AlertDialog) next to the heading — "Reset All Templates"
3. Import `AlertDialog` components and `RefreshCw` icon

The button will be placed in the header area next to the "Email Templates" title. It will show a confirmation dialog warning that all customizations will be lost.

### Technical Details

```typescript
const resetTemplates = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  
  // Delete all templates
  await supabase.from('email_templates').delete().eq('user_id', user.id);
  
  setSelectedTemplate(null);
  setTemplates([]);
  
  // Recreate defaults
  await createDefaultTemplates();
  
  toast({ title: "Templates reset", description: "All templates have been reset to defaults." });
};
```

### Files
- `src/components/EmailTemplates.tsx` — add reset button with AlertDialog confirmation + `resetTemplates` function

