import prikklLogo from "@/assets/prikkl_logo.svg";
import netviceLogo from "@/assets/netvice_logo.webp";

interface FaviconInfo {
  href: string;
  type: string;
  sizes?: string;
  media?: string;
}

export interface BrandInfo {
  logo: string;
  name: string;
  favicons: FaviconInfo[];
}

export function useBrandLogo(): BrandInfo | null {
  const hostname = window.location.hostname;

  if (hostname.includes("prikkl")) {
    return {
      logo: prikklLogo,
      name: "Prikkl",
      favicons: [
        { href: "https://prikkl.nl/wp-content/themes/prikkl/dist/img/favicon/favicon-32x32.png", type: "image/png", sizes: "32x32" },
        { href: "https://prikkl.nl/wp-content/themes/prikkl/dist/img/favicon/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      ],
    };
  }

  if (hostname.includes("netvice")) {
    return {
      logo: netviceLogo,
      name: "Netvice",
      favicons: [
        { href: "https://images.squarespace-cdn.com/content/v1/662f6473746dfd1d1afbb33f/6542b6f4-f858-43fd-962b-3af1c8e74cd3/favicon.ico?format=100w", type: "image/x-icon", media: "(prefers-color-scheme: light)" },
        { href: "https://images.squarespace-cdn.com/content/v1/662f6473746dfd1d1afbb33f/5da60ea7-2319-4903-bb70-14d3cac56885/favicon.ico?format=100w", type: "image/x-icon", media: "(prefers-color-scheme: dark)" },
      ],
    };
  }

  return null;
}
