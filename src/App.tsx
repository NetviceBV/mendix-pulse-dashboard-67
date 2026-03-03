import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import CloudActions from "./pages/CloudActions";
import { useBrandLogo } from "./hooks/useBrandLogo";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

function useDynamicFavicon() {
  const brand = useBrandLogo();
  useEffect(() => {
    // Remove existing favicons
    document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());

    if (brand) {
      brand.favicons.forEach((fav) => {
        const link = document.createElement("link");
        link.rel = "icon";
        link.type = fav.type;
        link.href = fav.href;
        if (fav.sizes) link.setAttribute("sizes", fav.sizes);
        if (fav.media) link.setAttribute("media", fav.media);
        document.head.appendChild(link);
      });
    } else {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = "/favicon.ico";
      document.head.appendChild(link);
    }
  }, [brand]);
}

const App = () => {
  useDynamicFavicon();
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/cloud-actions" element={<CloudActions />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
