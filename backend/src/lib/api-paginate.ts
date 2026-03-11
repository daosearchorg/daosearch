/**
 * Re-paginate results from a query function that uses a fixed internal page size.
 * When `limit` is specified, maps the requested page to the correct internal page
 * and slices the results accordingly.
 *
 * Example: limit=10, page=2 → items 11-20 from the dataset
 */
export async function paginatedQuery<T>(
  queryFn: (page: number) => Promise<{ items: T[]; total: number; totalPages: number }>,
  page: number,
  limit?: number,
): Promise<{ items: T[]; total: number; totalPages: number; page: number }> {
  if (!limit) {
    const result = await queryFn(page);
    return { ...result, page };
  }

  const result = await queryFn(1);
  const internalPageSize = result.items.length || limit;
  const total = result.total;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Calculate which items we need
  const startIdx = (page - 1) * limit;

  // Figure out which internal page contains our start index
  const internalPage = Math.floor(startIdx / internalPageSize) + 1;
  const offsetInPage = startIdx % internalPageSize;

  let items: T[];
  if (internalPage === 1) {
    items = result.items.slice(offsetInPage, offsetInPage + limit);
  } else {
    const pageResult = await queryFn(internalPage);
    items = pageResult.items.slice(offsetInPage, offsetInPage + limit);

    // If we need items spanning two internal pages
    if (items.length < limit && offsetInPage + limit > internalPageSize) {
      const nextResult = await queryFn(internalPage + 1);
      const remaining = limit - items.length;
      items = items.concat(nextResult.items.slice(0, remaining));
    }
  }

  return { items, total, totalPages, page };
}
