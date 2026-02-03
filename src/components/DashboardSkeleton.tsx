import { Skeleton } from "@/components/ui/skeleton";
import { AppCardSkeleton } from "./AppCardSkeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Search skeleton */}
      <div className="relative max-w-md">
        <Skeleton className="h-10 w-full" />
      </div>
      
      {/* Tabs skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-md" />
        
        {/* Grid of app cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <AppCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
