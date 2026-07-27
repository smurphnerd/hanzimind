import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the deck detail layout: header, stats, then the grouped glyph chips. */
export function DeckDetailLoading() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Skeleton className="mb-6 h-5 w-32" />

      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>

      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>

      <Skeleton className="mb-8 h-2.5 w-full rounded-full" />

      <div className="mb-4 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="space-y-6">
        {[...Array(2)].map((_, group) => (
          <Card key={group} className="gap-4">
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {[...Array(12)].map((_, chip) => (
                  <Skeleton key={chip} className="h-14 w-24 rounded-2xl" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
