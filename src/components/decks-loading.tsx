import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DecksLoading() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Page Heading */}
      <div className="flex justify-between items-center mb-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Search Input */}
      <Skeleton className="h-10 w-full mb-8" />

      {/* Most Popular Section */}
      <div>
        <Skeleton className="h-7 w-40 mb-4" />

        {/* Grid of Deck Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-full">
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="flex-1" />
              <CardFooter>
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
