

## Domain-Based Logo Branding

### Overview
Display the Prikkl or Netvice logo based on the browser's subdomain, with a fallback to the existing Activity (graph) icon for other domains (including Lovable preview).

### Assets
- Copy `prikkl_logo_1.svg` to `src/assets/prikkl_logo.svg`
- Copy `Netvice_Logo_Wit.webp` to `src/assets/netvice_logo.webp`

### New Utility: `src/hooks/useBrandLogo.ts`
A small hook that reads `window.location.hostname` and returns branding info:
- `ops.prikkl.nl` --> Prikkl logo + "Prikkl" name
- `ops.netvice.nl` --> Netvice logo + "Netvice" name
- Anything else --> `null` (use default Activity icon)

### Component Changes

**`src/pages/SignIn.tsx`**
- Replace the Shield icon above the form with the branded logo (or keep Shield as fallback)
- Logo displayed at ~120px width, centered above the card title

**`src/pages/Dashboard.tsx`**
- Replace the Activity icon in the header with the branded logo (or keep Activity as fallback)
- Logo sized to fit the header (~32px height)

### Technical Detail

```text
useBrandLogo hook:
  hostname = window.location.hostname
  if hostname includes 'prikkl' -> return { logo: prikklLogo, name: 'Prikkl' }
  if hostname includes 'netvice' -> return { logo: netviceLogo, name: 'Netvice' }
  else -> return null

SignIn.tsx:
  const brand = useBrandLogo()
  In header: brand ? <img src={brand.logo} /> : <Shield icon />

Dashboard.tsx:
  const brand = useBrandLogo()
  In header: brand ? <img src={brand.logo} /> : <Activity icon />
```

### Files Changed
1. `src/assets/prikkl_logo.svg` (new - copied from upload)
2. `src/assets/netvice_logo.webp` (new - copied from upload)
3. `src/hooks/useBrandLogo.ts` (new)
4. `src/pages/SignIn.tsx` (add logo above form)
5. `src/pages/Dashboard.tsx` (replace header icon with logo)

