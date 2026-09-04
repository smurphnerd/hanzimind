"use client";

import { useState } from "react";
import Link from "next/link";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { useTrackedMutation } from "@/hooks/use-tracked-mutation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditableCell } from "@/components/editable-cell";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { ManageMemoryAidsDialog } from "@/components/manage-memory-aids-dialog";
import { ScriptBadge } from "@/components/script-badge";
import { Mika } from "@/components/mika";
import { useORPC } from "@/lib/orpc.client";
import { cn } from "@/lib/utils";
import type { Script, VocabType } from "@/definitions/definitions";
import { Lightbulb } from "lucide-react";

const PAGE_SIZE = 50;

const TYPE_FILTERS: { label: string; value: VocabType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Components", value: "component" },
  { label: "Characters", value: "character" },
  { label: "Words", value: "compound" },
  { label: "Sentences", value: "sentence" },
];

// `both` is the majority — a glyph written the same way in either script — so the
// interesting filters are the two that name a glyph with a distinct counterpart.
const SCRIPT_FILTERS: { label: string; value: Script | "all" }[] = [
  { label: "Any script", value: "all" },
  { label: "Simplified", value: "simplified" },
  { label: "Traditional", value: "traditional" },
  { label: "Same in both", value: "both" },
];

function AdminVocabContent() {
  const orpc = useORPC();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VocabType | "all">("component");
  const [scriptFilter, setScriptFilter] = useState<Script | "all">("all");
  const [showDisabled, setShowDisabled] = useState(false);
  const [page, setPage] = useState(1);
  const [aidsItem, setAidsItem] = useState<{
    id: string;
    vocabItem: string;
  } | null>(null);

  const { data: counts } = useQuery(orpc.admin.vocabCounts.queryOptions({}));

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    ...orpc.admin.listVocabItems.queryOptions({
      input: {
        search: activeSearch || undefined,
        vocabType: typeFilter === "all" ? undefined : typeFilter,
        script: scriptFilter === "all" ? undefined : scriptFilter,
        // `undefined` means "both"; the toggle narrows to just the hidden ones.
        disabled: showDisabled ? true : undefined,
        page,
        pageSize: PAGE_SIZE,
      },
    }),
    // Keeps the table on screen while a new page or search loads, instead of
    // flashing an empty state between every keystroke-committed query.
    placeholderData: keepPreviousData,
  });

  const updateMutation = useTrackedMutation(
    orpc.admin.updateVocabItem.mutationOptions({
      onSuccess: (updated) => {
        toast.success(`Updated ${updated.vocabItem}`);
        // Input-agnostic: an edit made on page 3 must not leave page 1 stale.
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.listVocabItems.key(),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.vocabCounts.key(),
        });
      },
      onError: (mutationError) => {
        toast.error(
          mutationError instanceof Error
            ? mutationError.message
            : "Failed to update",
        );
      },
    }),
  );

  const update = (patch: Parameters<typeof updateMutation.mutate>[0]) => {
    updateMutation.mutate(patch);
  };

  const countFor = (type: VocabType | "all") => {
    if (!counts) return null;
    const rows =
      type === "all" ? counts : counts.filter((c) => c.vocabType === type);
    return rows.reduce((sum, row) => sum + row.count, 0);
  };

  const disabledTotal =
    counts?.filter((c) => c.disabled).reduce((sum, c) => sum + c.count, 0) ?? 0;

  const items = data?.items ?? [];
  const paging = data?.pagingInfo;

  if (isError) {
    const message = error instanceof Error ? error.message : "";
    const forbidden = /forbidden/i.test(message);

    return (
      <EmptyState
        pose="peek"
        title={
          forbidden
            ? "This page is for admins only."
            : "Couldn't load the vocabulary."
        }
        action={
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Partition summary */}
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((filter) => {
          const total = countFor(filter.value);
          const active = typeFilter === filter.value;
          return (
            <Button
              key={filter.value}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTypeFilter(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
              {total !== null && (
                <span
                  className={cn(
                    "ml-2 tabular-nums",
                    active ? "opacity-80" : "text-muted-foreground",
                  )}
                >
                  {total}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {/* Search and the hidden-only toggle */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            placeholder="Search glyph, reading or definition…"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setActiveSearch(search);
                setPage(1);
              }
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {SCRIPT_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={scriptFilter === filter.value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setScriptFilter(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={showDisabled}
            onCheckedChange={(checked) => {
              setShowDisabled(checked);
              setPage(1);
            }}
          />
          Hidden only
          <Badge variant="secondary" className="tabular-nums">
            {disabledTotal}
          </Badge>
        </label>
      </div>

      {/* Table */}
      <Card>
        <CardContent className={cn("p-0", isPlaceholderData && "opacity-60")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[7%]">Glyph</TableHead>
                <TableHead className="w-[9%]">Type</TableHead>
                <TableHead className="w-[10%]">Script</TableHead>
                <TableHead className="w-[9%]">Reading</TableHead>
                <TableHead className="w-[25%]">Definition</TableHead>
                <TableHead className="w-[8%]">Aids</TableHead>
                <TableHead className="w-[11%]">Component</TableHead>
                <TableHead className="w-[11%]">Phonetic</TableHead>
                <TableHead className="w-[10%]">Hidden</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 9 }).map((__, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isPending && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Mika pose="sleep" size={64} />
                      <p className="text-muted-foreground">
                        Nothing matches those filters.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {items.map((item) => {
                const isSaving = updateMutation.isSaving(
                  (variables) => variables.id === item.id,
                );
                // Only single characters can meaningfully be a bound form; a
                // word or sentence never is.
                const canBeComponent =
                  item.vocabType === "character" ||
                  item.vocabType === "component";

                return (
                  <TableRow
                    key={item.id}
                    className={cn(item.disabled && "opacity-50")}
                  >
                    <TableCell>
                      <Link
                        href={`/dictionary/${encodeURIComponent(item.vocabItem)}`}
                        className="hanzi text-2xl hover:text-primary"
                      >
                        {item.vocabItem}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ItemTypeBadge type={item.vocabType} short />
                    </TableCell>
                    <TableCell>
                      <ScriptBadge script={item.script} />
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        serverValue={item.pinyin}
                        allowEmpty
                        isSaving={isSaving}
                        ariaLabel={`Reading for ${item.vocabItem}`}
                        placeholder="No reading"
                        inputClassName="hanzi"
                        onSave={(pinyin) => update({ id: item.id, pinyin })}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        serverValue={item.translation ?? ""}
                        allowEmpty={false}
                        isSaving={isSaving}
                        ariaLabel={`Definition for ${item.vocabItem}`}
                        placeholder="No definition"
                        onSave={(translation) =>
                          update({ id: item.id, translation })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Manage memory aids for ${item.vocabItem}`}
                        onClick={() =>
                          setAidsItem({
                            id: item.id,
                            vocabItem: item.vocabItem,
                          })
                        }
                      >
                        <Lightbulb className="size-4" />
                        Aids
                      </Button>
                    </TableCell>
                    <TableCell>
                      {canBeComponent ? (
                        <Switch
                          checked={item.vocabType === "component"}
                          disabled={isSaving}
                          aria-label={`Mark ${item.vocabItem} as a component`}
                          onCheckedChange={(checked) =>
                            update({
                              id: item.id,
                              vocabType: checked ? "component" : "character",
                            })
                          }
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {/* Only a component has a reading worth *not* teaching:
                          everything else is quizzed on its own pinyin anyway. */}
                      {item.vocabType === "component" ? (
                        <Switch
                          checked={item.phonetic}
                          disabled={isSaving}
                          aria-label={`Teach the sound of ${item.vocabItem}`}
                          onCheckedChange={(checked) =>
                            update({ id: item.id, phonetic: checked })
                          }
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={item.disabled}
                        disabled={isSaving}
                        aria-label={`Hide ${item.vocabItem}`}
                        onCheckedChange={(checked) =>
                          update({ id: item.id, disabled: checked })
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paging */}
      {paging && (
        <Pagination
          page={paging.page}
          pageSize={paging.pageSize}
          total={paging.total}
          onPageChange={setPage}
        />
      )}

      <ManageMemoryAidsDialog
        item={aidsItem}
        open={aidsItem !== null}
        onOpenChange={(open) => !open && setAidsItem(null)}
      />
    </div>
  );
}

export default function AdminVocabPage() {
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        title="Vocabulary"
        description={
          <>
            Every component is taught by meaning. <strong>Phonetic</strong> adds
            sound: right for 艮 behind 很/跟/根, wrong for 亻, whose
            &ldquo;rén&rdquo; is borrowed from 人. Most components store a
            borrowed reading, so the two are separate switches — a reading is
            only ever quizzed when Phonetic is on, and turning it off hides the
            reading everywhere rather than deleting it. The next classification
            backfill resets Phonetic from the seed file. Hidden items disappear
            from decompositions, search and study everywhere.
          </>
        }
      />

      <AdminVocabContent />
    </div>
  );
}
