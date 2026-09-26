/** Return a bounded page without losing entries when a filter shrinks the list. */
export function paginateItems<T>(items: readonly T[], requestedPage: number, pageSize: number) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Number.isFinite(requestedPage) ? Math.max(0, Math.min(pages - 1, Math.floor(requestedPage))) : 0;
  return { items: items.slice(page * size, (page + 1) * size), page, pages, total: items.length };
}
