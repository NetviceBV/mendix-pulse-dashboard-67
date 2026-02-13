

## Make Settings Tabs Readable

The 8 tabs are crammed into a single horizontal row, causing text to overlap and become unreadable. The fix is to replace the current `grid-cols-8` tab layout with a scrollable or wrapped layout that gives each tab enough space.

### Approach

Replace the rigid 8-column grid with a **horizontally scrollable tab bar** using `flex-wrap` or `overflow-x-auto`, so tabs naturally size to their content and remain readable at all screen sizes.

### Technical Details

**File: `src/pages/Settings.tsx`**

Change the `TabsList` from:
```tsx
<TabsList className="grid w-full grid-cols-8">
```
To a flexible, scrollable layout:
```tsx
<TabsList className="flex flex-wrap h-auto gap-1 p-1 w-full">
```

This will:
- Let each tab auto-size to fit its text
- Wrap to a second row if the screen is too narrow
- Keep all tab labels fully visible and clickable

No other files need to change.

