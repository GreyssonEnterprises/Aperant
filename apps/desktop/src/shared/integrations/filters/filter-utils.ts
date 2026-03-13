/**
 * Shared filter utilities for integrations
 *
 * Handles platform differences:
 * - GitHub uses 'open', GitLab uses 'opened' for active state
 * - Both use 'closed' and 'all'
 * - GitLab MRs additionally have 'merged' state
 */
import type { FilterState } from '../types/base-types';

export interface Filterable {
  state: string;
}

/**
 * Normalize 'open' and 'opened' to a common key for comparison
 * GitHub uses 'open', GitLab uses 'opened' - treat them as equivalent
 */
function normalizeState(state: string): string {
  if (state === 'open' || state === 'opened') {
    return 'open'; // Normalize to 'open' for comparison
  }
  return state;
}

export function applyFilter<T extends Filterable>(
  items: T[],
  filterState: FilterState
): T[] {
  if (filterState === 'all') return items;

  // Normalize both for comparison (handles 'open' vs 'opened')
  const normalizedFilter = normalizeState(filterState);
  return items.filter(item => normalizeState(item.state) === normalizedFilter);
}

export function getFilterPredicate(filterState: FilterState) {
  return (item: Filterable): boolean => {
    if (filterState === 'all') return true;
    return normalizeState(item.state) === normalizeState(filterState);
  };
}

export function isValidFilterState(value: string): value is FilterState {
  return ['open', 'opened', 'closed', 'merged', 'all'].includes(value);
}
