"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ErrorBoundary } from "@/components/error-boundary";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { ManageMemoryAidsDialog } from "@/components/manage-memory-aids-dialog";
import { Mika } from "@/components/mika";
import { useORPC } from "@/lib/orpc.client";
import { cn } from "@/lib/utils";
import type { VocabType } from "@/definitions/definitions";
import { Lightbulb } from "lucide-react";

const PAGE_SIZE = 50;

const TYPE_FILTERS: { label: string; value: VocabType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Components", value: "component" },
  { label: "Characters", value: "character" },
  { label: "Words", value: "compound" },
  { label: "Sentences", value: "sentence" },
];

/**
 * A single-field inline editor — commits on blur or Enter, reverts on Escape.
 *
 * `allowEmpty` distinguishes the two columns that use it: a definition is the
 * only thing a component can be quizzed on, so blanking it is refused and the
 * field snaps back; a reading may legitimately be empty, so an empty commit is
 * sent through.
 */
function EditableCell({
  serverValue,
  allowEmpty,
  onSave,
  isSaving,
  ariaLabel,
  placeholder,
  inputClassName,
}: {
  serverValue: string;
  allowEmpty: boolean;
  onSave: (value: string) => void;
  isSaving: boolean;
  ariaLabel: string;
  placeholder: string;
  inputClassName?: string;
}) {
  const [value, setValue] = useState(serverValue);
  const [isEditing, setIsEditing] = useState(false);

  // The row can be re-fetched under us after a save elsewhere; while the field
  // is untouched, follow the server's value rather than the stale local one.
  if (!isEditing && value !== serverValue) setValue(serverValue);

  const commit = () => {
    setIsEditing(false);
    const trimmed = value.trim();
    if (trimmed === serverValue || (!allowEmpty && trimmed.length === 0)) {
      setValue(serverValue);
      return;
    }
    onSave(trimmed);
  };

  return (
    <Input
      value={value}
      disabled={isSaving}
      aria-label={ariaLabel}
      onChange={(event) => {
        setIsEditing(true);
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(serverValue);
          setIsEditing(false);
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "h-8 text-sm",
        !allowEmpty && !serverValue && "border-destructive/50",
        inputClassName,
      )}
      placeholder={placeholder}
    />
  );
}

function AdminVocabContent() {
  const orpc = useORPC();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VocabType | "all">("component");
  const [showDisabled, setShowDisabled] = useState(false);
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);
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

  const updateMutation = useMutation(
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
      onSettled: () => setSavingId(null),
    }),
  );

  const update = (id: string, patch: Parameters<typeof updateMutation.mutate>[0]) => {
    setSavingId(id);
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
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Mika pose="peek" size={96} />
          <p className="text-muted-foreground">
            {forbidden
              ? "This page is for admins only."
              : "Couldn't load the vocabulary."}
          </p>
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </CardContent>
      </Card>
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
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
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
                <TableHead className="w-[9%]">Glyph</TableHead>
                <TableHead className="w-[12%]">Type</TableHead>
                <TableHead className="w-[11%]">Reading</TableHead>
                <TableHead className="w-[32%]">Definition</TableHead>
                <TableHead className="w-[10%]">Aids</TableHead>
                <TableHead className="w-[14%]">Component</TableHead>
                <TableHead className="w-[12%]">Hidden</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 7 }).map((__, cell) => (
                      <TableCell key={cell}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isPending && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
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
                const isSaving = savingId === item.id;
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
                      <EditableCell
                        serverValue={item.pinyin}
                        allowEmpty
                        isSaving={isSaving}
                        ariaLabel={`Reading for ${item.vocabItem}`}
                        placeholder="No reading"
                        inputClassName="hanzi"
                        onSave={(pinyin) =>
                          update(item.id, { id: item.id, pinyin })
                        }
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
                          update(item.id, { id: item.id, translation })
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
                            update(item.id, {
                              id: item.id,
                              vocabType: checked ? "component" : "character",
                            })
                          }
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={item.disabled}
                        disabled={isSaving}
                        aria-label={`Hide ${item.vocabItem}`}
                        onCheckedChange={(checked) =>
                          update(item.id, { id: item.id, disabled: checked })
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
      {paging && paging.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm tabular-nums">
            {(paging.page - 1) * paging.pageSize + 1}–
            {Math.min(paging.page * paging.pageSize, paging.total)} of{" "}
            {paging.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={paging.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={paging.page >= paging.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
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
      <div className="mb-8">
        <h1 className="font-display text-foreground text-4xl font-extrabold tracking-tight">
          Vocabulary
        </h1>
        <p className="text-muted-foreground mt-2">
          Components are taught by meaning alone, so their reading is never used
          in study — but it is kept, not wiped, when you mark one, and both the
          reading and definition are editable in place. Hidden items disappear
          from decompositions, search and study everywhere.
        </p>
      </div>

      <ErrorBoundary>
        <AdminVocabContent />
      </ErrorBoundary>
    </div>
  );
}
