/**
 * Merge System Index Tests
 *
 * Tests for the merge system index exports.
 * Verifies all public exports are accessible.
 */

import { describe, it, expect } from 'vitest';
import * as merge from '../index';

describe('Merge System Index', () => {
  it('should export types module', () => {
    expect(merge).toBeDefined();
  });

  it('should export SemanticAnalyzer', () => {
    expect(merge.SemanticAnalyzer).toBeDefined();
  });

  it('should export AutoMerger', () => {
    expect(merge.AutoMerger).toBeDefined();
  });

  it('should export ConflictDetector', () => {
    expect(merge.ConflictDetector).toBeDefined();
  });

  it('should export FileEvolutionTracker', () => {
    expect(merge.FileEvolutionTracker).toBeDefined();
  });

  it('should export FileTimelineTracker', () => {
    expect(merge.FileTimelineTracker).toBeDefined();
  });

  it('should export MergeOrchestrator', () => {
    expect(merge.MergeOrchestrator).toBeDefined();
  });
});
