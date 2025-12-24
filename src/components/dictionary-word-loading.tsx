import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DictionaryWordLoading() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Skeleton className="mb-6 h-5 w-20" />

      {/* Header Card */}
      <Card className="mb-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16" />
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </Card>

      {/* Definition Card */}
      <Card className="mb-6 p-6">
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-3 w-48" />
      </Card>

      {/* Visuals Grid */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          <Skeleton className="aspect-square w-full" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="py-8 flex gap-4 justify-center">
            <Skeleton className="h-20 w-20" />
            <Skeleton className="h-20 w-20" />
          </div>
        </Card>
      </div>

      {/* Memory Aids Card */}
      <Card className="p-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border-b border-border pb-4">
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
