import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for the dictionary detail page. The shapes deliberately mirror the
 * real layout — same 112px glyph tile, same gap-6 rhythm — so hydrating doesn't
 * visibly shift the page.
 *
 * `word` decides how many visuals cards to reserve. The type isn't known until
 * the query resolves, but the glyph count already settles it: a multi-character
 * entry is a compound or a sentence, which never has stroke order and so renders
 * a single full-width parts card. Guessing two columns there would paint a tall
 * stroke-order placeholder that vanishes, yanking the memory aids up the page.
 */
export function DictionaryWordLoading({ word }: { word?: string }) {
  // Count code points, not UTF-16 units — a surrogate-pair glyph is one character.
  const multiCharacter = word ? [...word].length > 1 : false;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Skeleton className="mb-6 h-5 w-36" />

      {/* Header */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex items-center gap-6">
            <Skeleton className="size-28 shrink-0 rounded-2xl" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-10 w-36 rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Definition */}
      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-56" />
        </CardContent>
      </Card>

      {/* Visuals */}
      {multiCharacter ? (
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-5 w-44" />
          </CardHeader>
          <CardContent>
            <div className="flex justify-center gap-3">
              {[...Array([...(word ?? "")].length)].map((_, i) => (
                <Skeleton key={i} className="size-20 rounded-2xl" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="aspect-square w-full rounded-2xl" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <div className="flex justify-center gap-3">
                <Skeleton className="size-20 rounded-2xl" />
                <Skeleton className="size-20 rounded-2xl" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Memory Aids */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border-border border-b pb-4 last:border-b-0">
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
