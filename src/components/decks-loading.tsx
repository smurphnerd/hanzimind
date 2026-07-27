import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The deck card's shape, block for block: title, two clamped description lines,
 * the stat row, the composition strip with its legend, and the footer button.
 * Anything the real card grows has to grow here too, or the grid jumps when the
 * data lands.
 */
function DeckCardSkeleton() {
  return (
    <Card className="h-full gap-4">
      <CardHeader className="gap-2">
        <Skeleton className="h-6 w-2/3" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Skeleton className="h-10 w-full rounded-full" />
      </CardFooter>
    </Card>
  );
}

/** The browse grid's placeholder, shared by the page shell and the in-page refetch. */
export function DeckGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <DeckCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DecksLoading() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Page header — mirrors PageHeader's title/description/action rhythm */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <Skeleton className="h-12 w-40 rounded-full" />
      </div>

      {/* Search */}
      <Skeleton className="mb-8 h-12 w-full" />

      <Skeleton className="mb-6 h-8 w-40" />

      <DeckGridSkeleton />
    </div>
  );
}
