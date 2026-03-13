/**
 * Shared pagination utilities for integrations
 */

/**
 * Determine if there are more items to load based on total count and page size.
 * Returns true if totalCount exceeds pageSize, indicating additional pages exist.
 * @param totalCount - Total number of items available
 * @param pageSize - Number of items per page
 * @returns true if there are more pages to load
 */
export function calculateHasMore(totalCount: number, pageSize: number): boolean {
  return totalCount > pageSize;
}

export function appendWithoutDuplicates<T>(
  existing: T[],
  newItems: T[],
  key: keyof T
): T[] {
  const existingKeys = new Set(existing.map(item => String(item[key])));
  const uniqueNewItems = newItems.filter(item => !existingKeys.has(String(item[key])));
  return [...existing, ...uniqueNewItems];
}

export function getNextPage(currentPage: number): number {
  return currentPage + 1;
}

export function resetPagination(): { currentPage: number; hasMore: boolean } {
  return {
    currentPage: 1,
    hasMore: true
  };
}
