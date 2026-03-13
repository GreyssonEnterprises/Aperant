import { describe, it, expect } from 'vitest';
import { calculateHasMore, appendWithoutDuplicates } from '../pagination-utils';

describe('pagination-utils', () => {
  it('should calculate hasMore correctly', () => {
    expect(calculateHasMore(100, 50)).toBe(true);
    expect(calculateHasMore(50, 50)).toBe(false);
    expect(calculateHasMore(10, 50)).toBe(false);
  });

  it('should append items without duplicates', () => {
    const existing = [{ id: 1 }, { id: 2 }];
    const newItems = [{ id: 2 }, { id: 3 }];
    const result = appendWithoutDuplicates(existing, newItems, 'id');
    expect(result).toHaveLength(3);
    expect(result.map((i: { id: number }) => i.id)).toEqual([1, 2, 3]);
  });

  it('should handle empty arrays', () => {
    const result = appendWithoutDuplicates([], [{ id: 1 }], 'id');
    expect(result).toHaveLength(1);
  });

  it('should handle all duplicates', () => {
    const existing = [{ id: 1 }, { id: 2 }];
    const newItems = [{ id: 1 }, { id: 2 }];
    const result = appendWithoutDuplicates(existing, newItems, 'id');
    expect(result).toHaveLength(2);
  });
});
