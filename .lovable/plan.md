

## Plan: Extract Components from CloudActions.tsx

### Problem Summary
`CloudActions.tsx` is 1,287 lines with multiple components defined inline:
- `AddCloudActionDialog` (895 lines) - main extraction candidate
- `LogsDialog` (40 lines) - small utility dialog
- `CloudActionsPage` (287 lines) - the page component

This violates the single responsibility principle and makes the file difficult to maintain, test, and navigate.

### Proposed File Structure

```text
src/
├── pages/
│   └── CloudActions.tsx           (refactored: ~350 lines)
│
├── components/
│   ├── AddCloudActionDialog.tsx   (new: ~950 lines)
│   ├── CloudActionLogsDialog.tsx  (new: ~70 lines)
│   └── EditCloudActionDialog.tsx  (existing)
│
└── types/
    └── cloudActions.ts            (new: ~40 lines - shared types)
```

### Extraction Details

**File 1: `src/types/cloudActions.ts`** (NEW)
Extract shared interfaces to avoid duplication between Add and Edit dialogs:

| Type | Description |
|------|-------------|
| `CloudActionRow` | Database row structure for cloud_actions table |
| `Credential` | Mendix credentials reference |
| `App` | Mendix app metadata |
| `Env` | Environment metadata |
| `statusColor` | Status badge color mapping constant |

**File 2: `src/components/AddCloudActionDialog.tsx`** (NEW)
Move lines 59-954 to new file with:
- All current imports needed by the dialog
- The complete `AddCloudActionDialog` component
- Internal form schema and types
- All data fetching and form logic

Props interface:
```typescript
interface AddCloudActionDialogProps {
  onCreated: () => void;
}
```

**File 3: `src/components/CloudActionLogsDialog.tsx`** (NEW)
Move lines 957-997 (LogsDialog) to new file:

Props interface:
```typescript
interface CloudActionLogsDialogProps {
  actionId: string;
}
```

**File 4: `src/pages/CloudActions.tsx`** (REFACTOR)
Keep only:
- Page-level state management
- Data loading logic
- Action handlers (trigger, cancel, delete)
- Page layout and table rendering
- Import extracted components

### Code Sharing Benefits

After extraction, `AddCloudActionDialog` and `EditCloudActionDialog` share:
- Same Zod schema structure (can be extracted to shared file in future)
- Similar form field patterns
- Same data fetching patterns

### Migration Steps

| Step | Action | Risk |
|------|--------|------|
| 1 | Create `src/types/cloudActions.ts` with shared interfaces | Low |
| 2 | Create `src/components/CloudActionLogsDialog.tsx` | Low |
| 3 | Create `src/components/AddCloudActionDialog.tsx` | Medium |
| 4 | Update `src/pages/CloudActions.tsx` imports and remove inline components | Low |
| 5 | Update `EditCloudActionDialog.tsx` to use shared types | Low |

### Technical Considerations

**Form Schema Placement**:
- Keep the Zod schema inside `AddCloudActionDialog` component (not at module level)
- This matches the current pattern and allows `z.infer` to work correctly

**State Isolation**:
- Each dialog manages its own open/close state
- Parent only receives callbacks (`onCreated`, `onUpdated`)

**Import Updates**:
CloudActions.tsx will need:
```typescript
import { AddCloudActionDialog } from "@/components/AddCloudActionDialog";
import { CloudActionLogsDialog } from "@/components/CloudActionLogsDialog";
import { CloudActionRow, App, statusColor } from "@/types/cloudActions";
```

### File Size After Refactoring

| File | Before | After |
|------|--------|-------|
| `CloudActions.tsx` | 1,287 lines | ~350 lines |
| `AddCloudActionDialog.tsx` | N/A | ~950 lines |
| `CloudActionLogsDialog.tsx` | N/A | ~70 lines |
| `cloudActions.ts` (types) | N/A | ~40 lines |

### Benefits

1. **Maintainability**: Each file has a single responsibility
2. **Testability**: Components can be unit tested in isolation
3. **Code Navigation**: Easier to find and modify specific functionality
4. **Reusability**: Types and components can be imported elsewhere
5. **Future Refactoring**: Shared code between Add/Edit dialogs can be consolidated

