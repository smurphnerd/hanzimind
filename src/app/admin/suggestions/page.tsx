"use client";

import { useState } from "react";
import Link from "next/link";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { useTrackedMutation } from "@/hooks/use-tracked-mutation";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { ItemTypeBadge } from "@/components/item-type-badge";
import { PageHeader } from "@/components/page-header";
import { useORPC } from "@/lib/orpc.client";
import { cn } from "@/lib/utils";
import type {
  AdminSuggestionDto,
  SuggestionKind,
  SuggestionStatus,
} from "@/definitions/definitions";

const PAGE_SIZE = 25;

const STATUS_FILTERS: { label: string; value: SuggestionStatus | "all" }[] = [
  { label: "Open", value: "open" },
  { label: "Resolved", value: "resolved" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

const KIND_LABELS: Record<SuggestionKind, string> = {
  translation: "Meaning",
  pinyin: "Reading",
  decomposition: "Breakdown",
  audio: "Audio",
  memoryAid: "Memory aid",
  other: "Other",
};

/**
 * Each status as a Badge variant, so the pill says what it means rather than
 * which tint it picked. `secondary` is the app's coral wash and reads as "still
 * yours to deal with"; the label stays alongside, because colour is never the
 * only thing carrying the state.
 */
const STATUS_VARIANTS: Record<
  SuggestionStatus,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  open: "secondary",
  resolved: "success",
  rejected: "muted",
};

const formatFiledAt = (date: Date) =>
  date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** One row of the queue: what was reported, by whom, and the two ways out. */
function SuggestionRow({
  suggestion,
  isSaving,
  onReview,
}: {
  suggestion: AdminSuggestionDto;
  isSaving: boolean;
  onReview: (status: SuggestionStatus, adminNote: string) => void;
}) {
  const [note, setNote] = useState(suggestion.adminNote ?? "");

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {suggestion.vocabItem ? (
            <Link
              href={`/dictionary/${encodeURIComponent(suggestion.vocabItem)}`}
              className="hanzi text-3xl transition-colors hover:text-primary"
            >
              {suggestion.vocabItem}
            </Link>
          ) : (
            <span className="font-display font-bold text-muted-foreground">
              General feedback
            </span>
          )}
          <span className="mr-auto text-sm text-muted-foreground">
            {suggestion.translation ?? "No definition"}
          </span>
          {suggestion.vocabType && (
            <ItemTypeBadge type={suggestion.vocabType} short />
          )}
          <Badge variant="muted">{KIND_LABELS[suggestion.kind]}</Badge>
          <Badge
            variant={STATUS_VARIANTS[suggestion.status]}
            className="capitalize"
          >
            {suggestion.status}
          </Badge>
        </div>

        <p className="text-sm whitespace-pre-wrap">{suggestion.body}</p>

        {suggestion.memoryAid && (
          <p className="border-l-2 border-border pl-3 text-sm text-muted-foreground italic">
            {suggestion.memoryAid}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {suggestion.createdByUsername} ({suggestion.createdByEmail}) ·{" "}
          {formatFiledAt(suggestion.createdAt)}
        </p>

        <Textarea
          value={note}
          rows={2}
          disabled={isSaving}
          placeholder="Note for the record (optional)"
          aria-label="Admin note"
          className="resize-none text-sm"
          onChange={(event) => setNote(event.target.value)}
        />

        <div className="flex flex-wrap justify-end gap-2">
          {suggestion.status !== "open" && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isSaving}
              onClick={() => onReview("open", note)}
            >
              <RotateCcw className="size-4" />
              Reopen
            </Button>
          )}
          {suggestion.status !== "rejected" && (
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => onReview("rejected", note)}
            >
              <X className="size-4" />
              Reject
            </Button>
          )}
          {suggestion.status !== "resolved" && (
            <Button
              size="sm"
              disabled={isSaving}
              onClick={() => onReview("resolved", note)}
            >
              <Check className="size-4" />
              Resolve
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AdminSuggestionsContent() {
  const orpc = useORPC();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "all">(
    "open",
  );
  const [page, setPage] = useState(1);

  const { data: counts } = useQuery(
    orpc.admin.suggestionCounts.queryOptions({}),
  );

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    ...orpc.admin.listSuggestions.queryOptions({
      input: {
        status: statusFilter === "all" ? undefined : statusFilter,
        page,
        pageSize: PAGE_SIZE,
      },
    }),
    // Keeps the queue on screen while a new page or filter loads, instead of
    // flashing an empty state between every switch.
    placeholderData: keepPreviousData,
  });

  const reviewMutation = useTrackedMutation(
    orpc.admin.setSuggestionStatus.mutationOptions({
      onSuccess: (updated) => {
        toast.success(`Marked as ${updated.status}`);
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.listSuggestions.key(),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.suggestionCounts.key(),
        });
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Failed to update",
        );
      },
    }),
  );

  const countFor = (status: SuggestionStatus | "all") => {
    if (!counts) return null;
    const rows =
      status === "all" ? counts : counts.filter((row) => row.status === status);
    return rows.reduce((sum, row) => sum + row.count, 0);
  };

  const items = data?.items ?? [];
  const paging = data?.pagingInfo;

  if (isError) {
    return (
      <EmptyState
        pose="peek"
        title="Couldn't load the queue"
        description="Something went wrong fetching the suggestions."
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
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => {
          const total = countFor(filter.value);
          const active = statusFilter === filter.value;
          return (
            <Button
              key={filter.value}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStatusFilter(filter.value);
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

      <div className={cn("space-y-4", isPlaceholderData && "opacity-60")}>
        {isPending &&
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-52 w-full rounded-xl" />
          ))}

        {!isPending && items.length === 0 && (
          <EmptyState
            title="Nothing to review"
            description={
              statusFilter === "open"
                ? "No open suggestions — the garden is tidy."
                : "No suggestions in this bucket."
            }
          />
        )}

        {items.map((suggestion) => (
          <SuggestionRow
            // Keyed on the note as well as the row, so a refetch after a review
            // restarts the textarea from what the server now holds.
            key={`${suggestion.id}:${suggestion.adminNote ?? ""}`}
            suggestion={suggestion}
            isSaving={reviewMutation.isSaving(
              (variables) => variables.id === suggestion.id,
            )}
            onReview={(status, adminNote) =>
              reviewMutation.mutate({ id: suggestion.id, status, adminNote })
            }
          />
        ))}
      </div>

      {paging && (
        <Pagination
          page={paging.page}
          pageSize={paging.pageSize}
          total={paging.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export default function AdminSuggestionsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        title="Suggestions"
        description="What learners have reported. Resolving or rejecting one keeps a note against it, so the next reviewer can see what was decided."
      />

      <AdminSuggestionsContent />
    </div>
  );
}
