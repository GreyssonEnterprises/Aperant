/**
 * Shared pagination utilities for integrations
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
