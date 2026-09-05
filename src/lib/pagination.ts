/**
 * Where one page sits inside a result set.
 *
 * `page` is clamped, which is the part worth having. A list can lose rows under
 * an open page — an admin hides a glyph, a suggestion is resolved — and the
 * three copies this replaces all computed the label straight from the requested
 * page, so a shrunken result set rendered "181–45 of 45" until the next click.
 *
 * `from` and `to` are 1-based and inclusive, and both are 0 when there is
 * nothing to show, so a caller can test either one for emptiness.
 */
export type PageRange = {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): PageRange {
  // One page, so "Page 1 of 1" reads correctly when the list is empty rather
  // than "Page 1 of 0".
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(current * pageSize, total);

  return {
    page: current,
    totalPages,
    from,
    to,
    total,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
  };
}
