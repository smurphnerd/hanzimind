"use client";

import { Button } from "@/components/ui/button";
import { pageRange } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/**
 * The paging control for every paged list.
 *
 * Renders nothing when there is nothing to page, which is what all three of the
 * copies it replaces did at their own call sites, one of them by forgetting to.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** For a list that is refetching, so a click cannot outrun the data. */
  disabled?: boolean;
  className?: string;
}) {
  const range = pageRange(page, pageSize, total);

  if (range.total === 0) return null;

  return (
    <div
      data-slot="pagination"
      className={cn("flex items-center justify-between", className)}
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {range.from}–{range.to} of {range.total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !range.hasPrevious}
          onClick={() => onPageChange(range.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !range.hasNext}
          onClick={() => onPageChange(range.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
