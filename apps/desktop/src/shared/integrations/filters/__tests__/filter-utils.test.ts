import { describe, it, expect } from 'vitest';
import { applyFilter, getFilterPredicate } from '../filter-utils';
import type { FilterState } from '../../types/base-types';

describe('filter-utils', () => {
  interface TestItem {
    id: number;
    state: string; // Use string to accommodate different state formats
  }

  it('should filter by opened state', () => {
    const items: TestItem[] = [
      { id: 1, state: 'opened' },
      { id: 2, state: 'closed' },
      { id: 3, state: 'opened' }
    ];
    const result = applyFilter(items, 'opened');
    expect(result).toHaveLength(2);
    expect(result.every((i: TestItem) => i.state === 'opened')).toBe(true);
  });

  it('should normalize open/opened states (GitHub vs GitLab)', () => {
    const items: TestItem[] = [
      { id: 1, state: 'open' },      // GitHub format
      { id: 2, state: 'opened' },    // GitLab format
      { id: 3, state: 'closed' }
    ];
    // Filter with 'opened' should match both 'open' and 'opened'
    const result = applyFilter(items, 'opened');
    expect(result).toHaveLength(2);
    expect(result.map((i: TestItem) => i.id)).toEqual([1, 2]);
  });

  it('should return all items for "all" filter', () => {
    const items: TestItem[] = [
      { id: 1, state: 'opened' },
      { id: 2, state: 'closed' }
    ];
    const result = applyFilter(items, 'all');
    expect(result).toHaveLength(2);
  });

  it('should create filter predicate', () => {
    const predicate = getFilterPredicate('opened');
    expect(predicate({ state: 'opened' } as TestItem)).toBe(true);
    expect(predicate({ state: 'open' } as TestItem)).toBe(true); // Normalized
    expect(predicate({ state: 'closed' } as TestItem)).toBe(false);
  });

  it('should filter by closed state', () => {
    const items: TestItem[] = [
      { id: 1, state: 'opened' },
      { id: 2, state: 'closed' },
      { id: 3, state: 'opened' }
    ];
    const result = applyFilter(items, 'closed');
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('closed');
  });

  it('should filter by merged state', () => {
    const items: TestItem[] = [
      { id: 1, state: 'opened' },
      { id: 2, state: 'merged' },
      { id: 3, state: 'closed' }
    ];
    const result = applyFilter(items, 'merged');
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('merged');
  });
});
