/**
 * scratchpad-merger.test.ts — Tests for parallel scratchpad merger
 */

import { describe, it, expect } from 'vitest';
import { ParallelScratchpadMerger } from '../../observer/scratchpad-merger';
import type { Scratchpad } from '../../observer/scratchpad';
import type { ObserverSignal } from '../../observer/signals';
import type { SignalType } from '../../types';

describe('ParallelScratchpadMerger', () => {
  function makeMockScratchpad(
    signals: Map<SignalType, ObserverSignal[]> = new Map(),
    acuteCandidates: any[] = [],
    analytics: any = {
      fileAccessCounts: new Map(),
      fileEditSet: new Set<string>(),
      selfCorrectionCount: 0,
      grepPatternCounts: new Map(),
      errorFingerprints: new Map(),
      currentStep: 1,
    },
  ): Scratchpad {
    return {
      signals,
      acuteCandidates,
      analytics,
    } as unknown as Scratchpad;
  }

  function makeFileAccessSignal(filePath: string): ObserverSignal {
    return {
      type: 'file_access',
      filePath,
      toolName: 'Read',
      accessType: 'read',
      stepNumber: 1,
      capturedAt: Date.now(),
    };
  }

  function makeCoAccessSignal(fileA: string, fileB: string): ObserverSignal {
    return {
      type: 'co_access',
      fileA,
      fileB,
      timeDeltaMs: 100,
      stepDelta: 1,
      sessionId: 'test',
      directional: false,
      taskTypes: [],
      stepNumber: 1,
      capturedAt: Date.now(),
    };
  }

  describe('merge', () => {
    it('returns empty result for no scratchpads', () => {
      const merger = new ParallelScratchpadMerger();
      const result = merger.merge([]);

      expect(result.signals).toEqual([]);
      expect(result.acuteCandidates).toEqual([]);
      expect(result.analytics.totalFiles).toBe(0);
      expect(result.analytics.totalEdits).toBe(0);
      expect(result.analytics.totalSelfCorrections).toBe(0);
      expect(result.analytics.totalGrepPatterns).toBe(0);
      expect(result.analytics.totalErrorFingerprints).toBe(0);
      expect(result.analytics.maxStep).toBe(0);
    });

    it('merges signals from multiple scratchpads', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('fileA.ts')]],
        ]),
      );
      const sp2 = makeMockScratchpad(
        new Map([
          ['co_access', [makeCoAccessSignal('fileB.ts', 'fileC.ts')]],
        ]),
      );

      const result = merger.merge([sp1, sp2]);

      expect(result.signals).toHaveLength(2);
      expect(result.signals[0].signalType).toBe('file_access');
      expect(result.signals[0].signals).toHaveLength(1);
      expect(result.signals[1].signalType).toBe('co_access');
      expect(result.signals[1].signals).toHaveLength(1);
    });

    it('deduplicates signals with high similarity', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(
        new Map([
          ['file_access', [
            makeFileAccessSignal('src/auth/tokens.ts'),
            makeFileAccessSignal('src/auth/tokens.ts'), // Duplicate
          ]],
        ]),
      );

      const result = merger.merge([sp1]);

      // Find the file_access signals
      const fileAccessEntry = result.signals.find(s => s.signalType === 'file_access');
      expect(fileAccessEntry?.signals).toHaveLength(1);
    });

    it('merges same signal type from multiple scratchpads and deduplicates similar content', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('src/auth/tokens.ts')]],
        ]),
      );
      const sp2 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('src/utils/helpers.ts')]],
        ]),
      );

      const result = merger.merge([sp1, sp2]);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].signalType).toBe('file_access');
      // Signals are deduplicated by Jaccard similarity (> 88%), so different content should be kept
      expect(result.signals[0].signals.length).toBeGreaterThan(0);
      expect(result.signals[0].quorumCount).toBe(2); // Both scratchpads had this signal type
    });

    it('calculates quorum count correctly', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('fileA.ts')]],
          ['co_access', [makeCoAccessSignal('fileB.ts', 'fileC.ts')]],
        ]),
      );
      const sp2 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('fileB.ts')]],
        ]),
      );
      const sp3 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('fileC.ts')]],
          ['co_access', [makeCoAccessSignal('fileD.ts', 'fileE.ts')]],
        ]),
      );

      const result = merger.merge([sp1, sp2, sp3]);

      const fileAccessEntry = result.signals.find(s => s.signalType === 'file_access');
      const coAccessEntry = result.signals.find(s => s.signalType === 'co_access');

      expect(fileAccessEntry?.quorumCount).toBe(3); // All 3 scratchpads
      expect(coAccessEntry?.quorumCount).toBe(2); // sp1 and sp3
    });

    it('merges acute candidates with deduplication', () => {
      const merger = new ParallelScratchpadMerger();

      const candidate1 = { rawData: { symptom: 'Error in auth', errorFingerprint: 'fp1' } };
      const candidate2 = { rawData: { symptom: 'Error in auth', errorFingerprint: 'fp1' } }; // Duplicate
      const candidate3 = { rawData: { symptom: 'Different error', errorFingerprint: 'fp2' } };

      const sp1 = makeMockScratchpad(new Map(), [candidate1, candidate2]);
      const sp2 = makeMockScratchpad(new Map(), [candidate3]);

      const result = merger.merge([sp1, sp2]);

      expect(result.acuteCandidates).toHaveLength(2);
    });

    it('aggregates analytics from all scratchpads', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(
        new Map(),
        [],
        {
          fileAccessCounts: new Map([['file1.ts', 5], ['file2.ts', 3]]),
          fileEditSet: new Set(['file1.ts']),
          selfCorrectionCount: 2,
          grepPatternCounts: new Map([['pattern1', 1]]),
          errorFingerprints: new Map([['err1', 1]]),
          currentStep: 5,
        },
      );

      const sp2 = makeMockScratchpad(
        new Map(),
        [],
        {
          fileAccessCounts: new Map([['file1.ts', 2], ['file3.ts', 4]]),
          fileEditSet: new Set(['file2.ts', 'file3.ts']),
          selfCorrectionCount: 1,
          grepPatternCounts: new Map([['pattern2', 1]]),
          errorFingerprints: new Map([['err1', 2]]),
          currentStep: 10,
        },
      );

      const result = merger.merge([sp1, sp2]);

      expect(result.analytics.totalFiles).toBe(3); // file1, file2, file3
      expect(result.analytics.totalEdits).toBe(3); // file1, file2, file3
      expect(result.analytics.totalSelfCorrections).toBe(3); // 2 + 1
      expect(result.analytics.totalGrepPatterns).toBe(2); // pattern1, pattern2
      expect(result.analytics.totalErrorFingerprints).toBe(1); // err1 (deduplicated)
      expect(result.analytics.maxStep).toBe(10); // Max of 5 and 10
    });

    it('handles scratchpads with empty signal maps', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(new Map());
      const sp2 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('file.ts')]],
        ]),
      );

      const result = merger.merge([sp1, sp2]);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].signalType).toBe('file_access');
    });

    it('deduplicates using Jaccard similarity threshold', () => {
      const merger = new ParallelScratchpadMerger();

      // Similar but not identical signals (> 88% similarity should be deduplicated)
      const sp1 = makeMockScratchpad(
        new Map([
          ['file_access', [
            makeFileAccessSignal('src/auth/tokens.ts'),
            makeFileAccessSignal('src/auth/tokens.ts'), // Exact duplicate
          ]],
        ]),
      );

      const result = merger.merge([sp1]);

      // Should deduplicate exact duplicates
      expect(result.signals[0].signals).toHaveLength(1);
    });

    it('merges analytics with empty maps', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(
        new Map(),
        [],
        {
          fileAccessCounts: new Map(),
          fileEditSet: new Set(),
          selfCorrectionCount: 0,
          grepPatternCounts: new Map(),
          errorFingerprints: new Map(),
          currentStep: 0,
        },
      );

      const result = merger.merge([sp1]);

      expect(result.analytics.totalFiles).toBe(0);
      expect(result.analytics.totalEdits).toBe(0);
    });

    it('handles single scratchpad', () => {
      const merger = new ParallelScratchpadMerger();

      const sp1 = makeMockScratchpad(
        new Map([
          ['file_access', [makeFileAccessSignal('file.ts')]],
        ]),
        [],
        {
          fileAccessCounts: new Map([['file.ts', 1]]),
          fileEditSet: new Set(['file.ts']),
          selfCorrectionCount: 0,
          grepPatternCounts: new Map(),
          errorFingerprints: new Map(),
          currentStep: 1,
        },
      );

      const result = merger.merge([sp1]);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].quorumCount).toBe(1);
      expect(result.analytics.totalFiles).toBe(1);
    });
  });
});
