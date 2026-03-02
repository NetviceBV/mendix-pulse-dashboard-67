import prikklLogo from "@/assets/prikkl_logo.svg";
import netviceLogo from "@/assets/netvice_logo.webp";

interface BrandInfo {
  logo: string;
  name: string;
}

export function useBrandLogo(): BrandInfo | null {
  const hostname = window.location.hostname;

  if (hostname.includes("prikkl")) {
    return { logo: prikklLogo, name: "Prikkl" };
  }

  if (hostname.includes("netvice")) {
    return { logo: netviceLogo, name: "Netvice" };
  }

  return null;
}
