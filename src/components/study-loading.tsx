import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for the study deck list. Mirrors the real card block for block —
 * header, description, growth bar, status line, button — so nothing shifts when
 * the data lands.
 */
export function StudyLoading() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="size-10 shrink-0 rounded-full" />
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>

              <div className="space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full rounded-full" />
                <Skeleton className="h-3 w-44" />
              </div>

              <div className="mt-auto flex flex-col gap-3">
                <Skeleton className="h-7 w-40 rounded-full" />
                <Skeleton className="h-12 w-full rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder for a single study session — one prompt card and an answer box,
 * rather than the deck grid above.
 */
export function StudySessionLoading() {
  return (
    <div className="container mx-auto flex max-w-2xl flex-col items-center px-4 py-8">
      <Skeleton className="mb-6 h-2 w-full rounded-full" />

      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-6">
          <Skeleton className="size-40 rounded-2xl" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-12 w-full rounded-full" />
        </CardContent>
      </Card>
    </div>
  );
}
