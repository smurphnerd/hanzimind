import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DeckDetailLoading() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-6">
        <Skeleton className="h-5 w-32" />
      </div>

      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <Card className="mb-8">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4 mt-2" />
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-48" />
          <div className="flex items-center space-x-2">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 flex-1" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
