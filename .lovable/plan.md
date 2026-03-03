

## Dynamic Favicon Based on Subdomain

### Overview
Set the favicon dynamically at runtime based on the hostname, using the dedicated favicon URLs provided for Prikkl and Netvice. Follows the same subdomain-detection pattern already used in `useBrandLogo`.

### Changes

**`src/hooks/useBrandLogo.ts`** -- Add a `favicon` property to `BrandInfo` with the appropriate URLs per brand, and a `darkFavicon` for Netvice's dark-mode variant.

**`src/App.tsx`** -- Add a small `useEffect` that:
1. Checks `window.location.hostname`
2. Removes any existing favicon `<link>` tags
3. Injects the correct `<link rel="icon">` tag(s):
   - **Prikkl subdomain**: Two `<link>` tags for 32x32 and 16x16 PNGs from `prikkl.nl`
   - **Netvice subdomain**: Two `<link>` tags with `media="(prefers-color-scheme: light)"` and `media="(prefers-color-scheme: dark)"` pointing to the Squarespace favicon URLs
   - **Default**: Keep the existing `/favicon.ico`

### Favicon URLs Used

Prikkl:
- 32x32: `https://prikkl.nl/wp-content/themes/prikkl/dist/img/favicon/favicon-32x32.png`
- 16x16: `https://prikkl.nl/wp-content/themes/prikkl/dist/img/favicon/favicon-16x16.png`

Netvice:
- Light mode: `https://images.squarespace-cdn.com/content/v1/662f6473746dfd1d1afbb33f/6542b6f4-f858-43fd-962b-3af1c8e74cd3/favicon.ico?format=100w`
- Dark mode: `https://images.squarespace-cdn.com/content/v1/662f6473746dfd1d1afbb33f/5da60ea7-2319-4903-bb70-14d3cac56885/favicon.ico?format=100w`

### Technical Detail

The `useEffect` in `App.tsx` runs once on mount. It creates and appends `<link>` elements to `document.head`, handling sizes and dark/light mode preferences natively via the `media` attribute (browser handles the switching automatically for Netvice).

