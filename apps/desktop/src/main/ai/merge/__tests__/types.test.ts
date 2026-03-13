/**
 * Merge System Types Tests
 *
 * Tests for the merge system type definitions and utility functions.
 * Covers enum values, helper functions for semantic changes, file analysis,
 * conflict regions, task snapshots, file evolution, and merge results.
 */

import { describe, it, expect } from 'vitest';
import {
  ChangeType,
  ConflictSeverity,
  MergeStrategy,
  MergeDecision,
  isAdditiveChange,
  overlapsWithChange,
  semanticChangeToDict,
  semanticChangeFromDict,
  createFileAnalysis,
  isAdditiveOnly,
  locationsChanged,
  getChangesAtLocation,
  conflictRegionToDict,
  taskSnapshotHasModifications,
  taskSnapshotToDict,
  taskSnapshotFromDict,
  fileEvolutionToDict,
  fileEvolutionFromDict,
  getTaskSnapshot,
  addTaskSnapshot,
  getTasksInvolved,
  mergeResultSuccess,
  mergeResultNeedsHumanReview,
  computeContentHash,
  sanitizePathForStorage,
  type SemanticChange,
  type FileAnalysis,
  type ConflictRegion,
  type TaskSnapshot,
  type FileEvolution,
  type MergeResult,
} from '../types';

// ============================================
// Enum Values
// ============================================

describe('ChangeType enum', () => {
  it('should have import change types', () => {
    expect(ChangeType.ADD_IMPORT).toBe('add_import');
    expect(ChangeType.REMOVE_IMPORT).toBe('remove_import');
    expect(ChangeType.MODIFY_IMPORT).toBe('modify_import');
  });

  it('should have function change types', () => {
    expect(ChangeType.ADD_FUNCTION).toBe('add_function');
    expect(ChangeType.REMOVE_FUNCTION).toBe('remove_function');
    expect(ChangeType.MODIFY_FUNCTION).toBe('modify_function');
    expect(ChangeType.RENAME_FUNCTION).toBe('rename_function');
  });

  it('should have React/JSX change types', () => {
    expect(ChangeType.ADD_HOOK_CALL).toBe('add_hook_call');
    expect(ChangeType.REMOVE_HOOK_CALL).toBe('remove_hook_call');
    expect(ChangeType.WRAP_JSX).toBe('wrap_jsx');
    expect(ChangeType.UNWRAP_JSX).toBe('unwrap_jsx');
    expect(ChangeType.ADD_JSX_ELEMENT).toBe('add_jsx_element');
    expect(ChangeType.MODIFY_JSX_PROPS).toBe('modify_jsx_props');
  });

  it('should have variable change types', () => {
    expect(ChangeType.ADD_VARIABLE).toBe('add_variable');
    expect(ChangeType.REMOVE_VARIABLE).toBe('remove_variable');
    expect(ChangeType.MODIFY_VARIABLE).toBe('modify_variable');
    expect(ChangeType.ADD_CONSTANT).toBe('add_constant');
  });

  it('should have class change types', () => {
    expect(ChangeType.ADD_CLASS).toBe('add_class');
    expect(ChangeType.REMOVE_CLASS).toBe('remove_class');
    expect(ChangeType.MODIFY_CLASS).toBe('modify_class');
    expect(ChangeType.ADD_METHOD).toBe('add_method');
    expect(ChangeType.REMOVE_METHOD).toBe('remove_method');
    expect(ChangeType.MODIFY_METHOD).toBe('modify_method');
    expect(ChangeType.ADD_PROPERTY).toBe('add_property');
  });

  it('should have type change types', () => {
    expect(ChangeType.ADD_TYPE).toBe('add_type');
    expect(ChangeType.MODIFY_TYPE).toBe('modify_type');
    expect(ChangeType.ADD_INTERFACE).toBe('add_interface');
    expect(ChangeType.MODIFY_INTERFACE).toBe('modify_interface');
  });

  it('should have Python specific change types', () => {
    expect(ChangeType.ADD_DECORATOR).toBe('add_decorator');
    expect(ChangeType.REMOVE_DECORATOR).toBe('remove_decorator');
  });

  it('should have generic change types', () => {
    expect(ChangeType.ADD_COMMENT).toBe('add_comment');
    expect(ChangeType.MODIFY_COMMENT).toBe('modify_comment');
    expect(ChangeType.FORMATTING_ONLY).toBe('formatting_only');
    expect(ChangeType.UNKNOWN).toBe('unknown');
  });
});

describe('ConflictSeverity enum', () => {
  it('should have all severity levels', () => {
    expect(ConflictSeverity.NONE).toBe('none');
    expect(ConflictSeverity.LOW).toBe('low');
    expect(ConflictSeverity.MEDIUM).toBe('medium');
    expect(ConflictSeverity.HIGH).toBe('high');
    expect(ConflictSeverity.CRITICAL).toBe('critical');
  });
});

describe('MergeStrategy enum', () => {
  it('should have import strategies', () => {
    expect(MergeStrategy.COMBINE_IMPORTS).toBe('combine_imports');
  });

  it('should have function body strategies', () => {
    expect(MergeStrategy.HOOKS_FIRST).toBe('hooks_first');
    expect(MergeStrategy.HOOKS_THEN_WRAP).toBe('hooks_then_wrap');
    expect(MergeStrategy.APPEND_STATEMENTS).toBe('append_statements');
  });

  it('should have structural strategies', () => {
    expect(MergeStrategy.APPEND_FUNCTIONS).toBe('append_functions');
    expect(MergeStrategy.APPEND_METHODS).toBe('append_methods');
    expect(MergeStrategy.COMBINE_PROPS).toBe('combine_props');
  });

  it('should have ordering strategies', () => {
    expect(MergeStrategy.ORDER_BY_DEPENDENCY).toBe('order_by_dependency');
    expect(MergeStrategy.ORDER_BY_TIME).toBe('order_by_time');
  });

  it('should have fallback strategies', () => {
    expect(MergeStrategy.AI_REQUIRED).toBe('ai_required');
    expect(MergeStrategy.HUMAN_REQUIRED).toBe('human_required');
  });
});

describe('MergeDecision enum', () => {
  it('should have all decision outcomes', () => {
    expect(MergeDecision.AUTO_MERGED).toBe('auto_merged');
    expect(MergeDecision.AI_MERGED).toBe('ai_merged');
    expect(MergeDecision.NEEDS_HUMAN_REVIEW).toBe('needs_human_review');
    expect(MergeDecision.FAILED).toBe('failed');
    expect(MergeDecision.DIRECT_COPY).toBe('direct_copy');
  });
});

// ============================================
// SemanticChange Helpers
// ============================================

describe('isAdditiveChange', () => {
  it('should return true for ADD_IMPORT', () => {
    const change: SemanticChange = {
      changeType: ChangeType.ADD_IMPORT,
      target: 'react',
      location: 'line 1',
      lineStart: 1,
      lineEnd: 1,
      metadata: {},
    };
    expect(isAdditiveChange(change)).toBe(true);
  });

  it('should return true for ADD_FUNCTION', () => {
    const change: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'myFunction',
      location: 'line 10',
      lineStart: 10,
      lineEnd: 15,
      metadata: {},
    };
    expect(isAdditiveChange(change)).toBe(true);
  });

  it('should return true for ADD_HOOK_CALL', () => {
    const change: SemanticChange = {
      changeType: ChangeType.ADD_HOOK_CALL,
      target: 'useState',
      location: 'line 5',
      lineStart: 5,
      lineEnd: 5,
      metadata: {},
    };
    expect(isAdditiveChange(change)).toBe(true);
  });

  it('should return true for ADD_COMMENT', () => {
    const change: SemanticChange = {
      changeType: ChangeType.ADD_COMMENT,
      target: '',
      location: 'line 20',
      lineStart: 20,
      lineEnd: 20,
      metadata: {},
    };
    expect(isAdditiveChange(change)).toBe(true);
  });

  it('should return false for MODIFY_FUNCTION', () => {
    const change: SemanticChange = {
      changeType: ChangeType.MODIFY_FUNCTION,
      target: 'myFunction',
      location: 'line 10',
      lineStart: 10,
      lineEnd: 15,
      metadata: {},
    };
    expect(isAdditiveChange(change)).toBe(false);
  });

  it('should return false for REMOVE_IMPORT', () => {
    const change: SemanticChange = {
      changeType: ChangeType.REMOVE_IMPORT,
      target: 'unused',
      location: 'line 3',
      lineStart: 3,
      lineEnd: 3,
      metadata: {},
    };
    expect(isAdditiveChange(change)).toBe(false);
  });

  it('should return false for FORMATTING_ONLY', () => {
    const change: SemanticChange = {
      changeType: ChangeType.FORMATTING_ONLY,
      target: '',
      location: 'line 1-100',
      lineStart: 1,
      lineEnd: 100,
      metadata: {},
    };
    expect(isAdditiveChange(change)).toBe(false);
  });
});

describe('overlapsWithChange', () => {
  it('should return true when locations match', () => {
    const changeA: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 20,
      metadata: {},
    };
    const changeB: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'bar',
      location: 'src/file.ts:10',
      lineStart: 15,
      lineEnd: 25,
      metadata: {},
    };
    expect(overlapsWithChange(changeA, changeB)).toBe(true);
  });

  it('should return true when line ranges overlap', () => {
    const changeA: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 20,
      metadata: {},
    };
    const changeB: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'bar',
      location: 'src/file.ts:15',
      lineStart: 15,
      lineEnd: 25,
      metadata: {},
    };
    expect(overlapsWithChange(changeA, changeB)).toBe(true);
  });

  it('should return true when one change contains the other', () => {
    const changeA: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 30,
      metadata: {},
    };
    const changeB: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'bar',
      location: 'src/file.ts:15',
      lineStart: 15,
      lineEnd: 20,
      metadata: {},
    };
    expect(overlapsWithChange(changeA, changeB)).toBe(true);
  });

  it('should return false when changes do not overlap', () => {
    const changeA: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 20,
      metadata: {},
    };
    const changeB: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'bar',
      location: 'src/file.ts:30',
      lineStart: 30,
      lineEnd: 40,
      metadata: {},
    };
    expect(overlapsWithChange(changeA, changeB)).toBe(false);
  });

  it('should return false for adjacent but non-overlapping changes', () => {
    const changeA: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 20,
      metadata: {},
    };
    const changeB: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'bar',
      location: 'src/file.ts:21',
      lineStart: 21,
      lineEnd: 30,
      metadata: {},
    };
    expect(overlapsWithChange(changeA, changeB)).toBe(false);
  });
});

describe('semanticChangeToDict', () => {
  it('should convert semantic change to dict', () => {
    const change: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'myFunction',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 15,
      contentBefore: 'old',
      contentAfter: 'new',
      metadata: { key: 'value' },
    };

    const dict = semanticChangeToDict(change);

    expect(dict).toEqual({
      change_type: 'add_function',
      target: 'myFunction',
      location: 'src/file.ts:10',
      line_start: 10,
      line_end: 15,
      content_before: 'old',
      content_after: 'new',
      metadata: { key: 'value' },
    });
  });

  it('should handle missing optional content fields', () => {
    const change: SemanticChange = {
      changeType: ChangeType.ADD_IMPORT,
      target: 'react',
      location: 'line 1',
      lineStart: 1,
      lineEnd: 1,
      metadata: {},
    };

    const dict = semanticChangeToDict(change);

    expect(dict.content_before).toBeNull();
    expect(dict.content_after).toBeNull();
  });
});

describe('semanticChangeFromDict', () => {
  it('should convert dict to semantic change', () => {
    const dict = {
      change_type: 'add_function' as ChangeType,
      target: 'myFunction',
      location: 'src/file.ts:10',
      line_start: 10,
      line_end: 15,
      content_before: 'old' as string | null,
      content_after: 'new' as string | null,
      metadata: { key: 'value' },
    };

    const change = semanticChangeFromDict(dict);

    expect(change).toEqual({
      changeType: ChangeType.ADD_FUNCTION,
      target: 'myFunction',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 15,
      contentBefore: 'old',
      contentAfter: 'new',
      metadata: { key: 'value' },
    });
  });

  it('should handle missing optional fields', () => {
    const dict = {
      change_type: 'add_import' as ChangeType,
      target: 'react',
      location: 'line 1',
      line_start: 1,
      line_end: 1,
      metadata: {},
    };

    const change = semanticChangeFromDict(dict);

    expect(change.contentBefore).toBeUndefined();
    expect(change.contentAfter).toBeUndefined();
  });

  it('should round-trip correctly', () => {
    const original: SemanticChange = {
      changeType: ChangeType.MODIFY_FUNCTION,
      target: 'myFunction',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 15,
      contentBefore: 'function myFunction() {}',
      contentAfter: 'function myFunction() { return true; }',
      metadata: { reason: 'add return' },
    };

    const dict = semanticChangeToDict(original);
    const restored = semanticChangeFromDict(dict);

    expect(restored).toEqual(original);
  });
});

// ============================================
// FileAnalysis Helpers
// ============================================

describe('createFileAnalysis', () => {
  it('should create empty file analysis', () => {
    const analysis = createFileAnalysis('src/file.ts');

    expect(analysis.filePath).toBe('src/file.ts');
    expect(analysis.changes).toEqual([]);
    expect(analysis.functionsModified).toBeInstanceOf(Set);
    expect(analysis.functionsModified.size).toBe(0);
    expect(analysis.functionsAdded).toBeInstanceOf(Set);
    expect(analysis.importsAdded).toBeInstanceOf(Set);
    expect(analysis.importsRemoved).toBeInstanceOf(Set);
    expect(analysis.classesModified).toBeInstanceOf(Set);
    expect(analysis.totalLinesChanged).toBe(0);
  });
});

describe('isAdditiveOnly', () => {
  it('should return true when all changes are additive', () => {
    const analysis: FileAnalysis = {
      filePath: 'src/file.ts',
      changes: [
        {
          changeType: ChangeType.ADD_FUNCTION,
          target: 'foo',
          location: 'line 10',
          lineStart: 10,
          lineEnd: 15,
          metadata: {},
        },
        {
          changeType: ChangeType.ADD_IMPORT,
          target: 'react',
          location: 'line 1',
          lineStart: 1,
          lineEnd: 1,
          metadata: {},
        },
      ],
      functionsModified: new Set(),
      functionsAdded: new Set(['foo']),
      importsAdded: new Set(['react']),
      importsRemoved: new Set(),
      classesModified: new Set(),
      totalLinesChanged: 15,
    };

    expect(isAdditiveOnly(analysis)).toBe(true);
  });

  it('should return false when any change is non-additive', () => {
    const analysis: FileAnalysis = {
      filePath: 'src/file.ts',
      changes: [
        {
          changeType: ChangeType.ADD_FUNCTION,
          target: 'foo',
          location: 'line 10',
          lineStart: 10,
          lineEnd: 15,
          metadata: {},
        },
        {
          changeType: ChangeType.MODIFY_FUNCTION,
          target: 'bar',
          location: 'line 20',
          lineStart: 20,
          lineEnd: 25,
          metadata: {},
        },
      ],
      functionsModified: new Set(['bar']),
      functionsAdded: new Set(['foo']),
      importsAdded: new Set(),
      importsRemoved: new Set(),
      classesModified: new Set(),
      totalLinesChanged: 10,
    };

    expect(isAdditiveOnly(analysis)).toBe(false);
  });

  it('should return true for empty analysis', () => {
    const analysis = createFileAnalysis('src/file.ts');

    expect(isAdditiveOnly(analysis)).toBe(true);
  });
});

describe('locationsChanged', () => {
  it('should return set of unique locations', () => {
    const change1: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 15,
      metadata: {},
    };
    const change2: SemanticChange = {
      changeType: ChangeType.ADD_IMPORT,
      target: 'react',
      location: 'src/file.ts:1',
      lineStart: 1,
      lineEnd: 1,
      metadata: {},
    };
    const change3: SemanticChange = {
      changeType: ChangeType.MODIFY_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 15,
      metadata: {},
    };

    const analysis: FileAnalysis = {
      filePath: 'src/file.ts',
      changes: [change1, change2, change3],
      functionsModified: new Set(['foo']),
      functionsAdded: new Set(),
      importsAdded: new Set(['react']),
      importsRemoved: new Set(),
      classesModified: new Set(),
      totalLinesChanged: 15,
    };

    const locations = locationsChanged(analysis);

    expect(locations).toBeInstanceOf(Set);
    expect(locations.size).toBe(2);
    expect(locations.has('src/file.ts:10')).toBe(true);
    expect(locations.has('src/file.ts:1')).toBe(true);
  });
});

describe('getChangesAtLocation', () => {
  it('should return changes at specific location', () => {
    const change1: SemanticChange = {
      changeType: ChangeType.ADD_FUNCTION,
      target: 'foo',
      location: 'src/file.ts:10',
      lineStart: 10,
      lineEnd: 15,
      metadata: {},
    };
    const change2: SemanticChange = {
      changeType: ChangeType.ADD_IMPORT,
      target: 'react',
      location: 'src/file.ts:1',
      lineStart: 1,
      lineEnd: 1,
      metadata: {},
    };

    const analysis: FileAnalysis = {
      filePath: 'src/file.ts',
      changes: [change1, change2],
      functionsModified: new Set(),
      functionsAdded: new Set(['foo']),
      importsAdded: new Set(['react']),
      importsRemoved: new Set(),
      classesModified: new Set(),
      totalLinesChanged: 15,
    };

    const changes = getChangesAtLocation(analysis, 'src/file.ts:10');

    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe(ChangeType.ADD_FUNCTION);
  });

  it('should return empty array for location with no changes', () => {
    const analysis: FileAnalysis = {
      filePath: 'src/file.ts',
      changes: [],
      functionsModified: new Set(),
      functionsAdded: new Set(),
      importsAdded: new Set(),
      importsRemoved: new Set(),
      classesModified: new Set(),
      totalLinesChanged: 0,
    };

    const changes = getChangesAtLocation(analysis, 'src/file.ts:10');

    expect(changes).toEqual([]);
  });
});

// ============================================
// ConflictRegion Helpers
// ============================================

describe('conflictRegionToDict', () => {
  it('should convert conflict region to dict', () => {
    const conflict: ConflictRegion = {
      filePath: 'src/file.ts',
      location: 'src/file.ts:10',
      tasksInvolved: ['task-1', 'task-2'],
      changeTypes: [ChangeType.ADD_FUNCTION, ChangeType.MODIFY_FUNCTION],
      severity: ConflictSeverity.HIGH,
      canAutoMerge: false,
      mergeStrategy: MergeStrategy.HUMAN_REQUIRED,
      reason: 'Both tasks modify the same function',
    };

    const dict = conflictRegionToDict(conflict);

    expect(dict).toEqual({
      file_path: 'src/file.ts',
      location: 'src/file.ts:10',
      tasks_involved: ['task-1', 'task-2'],
      change_types: ['add_function', 'modify_function'],
      severity: 'high',
      can_auto_merge: false,
      merge_strategy: 'human_required',
      reason: 'Both tasks modify the same function',
    });
  });

  it('should handle missing merge strategy', () => {
    const conflict: ConflictRegion = {
      filePath: 'src/file.ts',
      location: 'src/file.ts:10',
      tasksInvolved: ['task-1'],
      changeTypes: [ChangeType.ADD_FUNCTION],
      severity: ConflictSeverity.LOW,
      canAutoMerge: true,
      reason: 'Single additive change',
    };

    const dict = conflictRegionToDict(conflict);

    expect(dict.merge_strategy).toBeNull();
  });
});

// ============================================
// TaskSnapshot Helpers
// ============================================

describe('taskSnapshotHasModifications', () => {
  it('should return true when semantic changes exist', () => {
    const snapshot: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [
        {
          changeType: ChangeType.ADD_FUNCTION,
          target: 'foo',
          location: 'line 10',
          lineStart: 10,
          lineEnd: 15,
          metadata: {},
        },
      ],
    };

    expect(taskSnapshotHasModifications(snapshot)).toBe(true);
  });

  it('should return true when hashes differ', () => {
    const snapshot: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };

    expect(taskSnapshotHasModifications(snapshot)).toBe(true);
  });

  it('should return true when only after hash exists (new file)', () => {
    const snapshot: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Create file',
      startedAt: new Date('2024-01-01'),
      contentHashBefore: '',
      contentHashAfter: 'def',
      semanticChanges: [],
    };

    expect(taskSnapshotHasModifications(snapshot)).toBe(true);
  });

  it('should return false when no changes and hashes match', () => {
    const snapshot: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'No-op',
      startedAt: new Date('2024-01-01'),
      contentHashBefore: 'abc',
      contentHashAfter: 'abc',
      semanticChanges: [],
    };

    expect(taskSnapshotHasModifications(snapshot)).toBe(false);
  });

  it('should return false when both hashes empty', () => {
    const snapshot: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'No-op',
      startedAt: new Date('2024-01-01'),
      contentHashBefore: '',
      contentHashAfter: '',
      semanticChanges: [],
    };

    expect(taskSnapshotHasModifications(snapshot)).toBe(false);
  });
});

describe('taskSnapshotToDict and taskSnapshotFromDict', () => {
  it('should round-trip correctly', () => {
    const original: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature X',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: new Date('2024-01-01T11:00:00Z'),
      contentHashBefore: 'abc123',
      contentHashAfter: 'def456',
      semanticChanges: [
        {
          changeType: ChangeType.ADD_FUNCTION,
          target: 'foo',
          location: 'line 10',
          lineStart: 10,
          lineEnd: 15,
          metadata: {},
        },
      ],
      rawDiff: '+function foo() {}',
    };

    const dict = taskSnapshotToDict(original);
    const restored = taskSnapshotFromDict(dict);

    expect(restored.taskId).toBe(original.taskId);
    expect(restored.taskIntent).toBe(original.taskIntent);
    expect(restored.startedAt.toISOString()).toBe(original.startedAt.toISOString());
    expect(restored.completedAt?.toISOString()).toBe(original.completedAt?.toISOString());
    expect(restored.contentHashBefore).toBe(original.contentHashBefore);
    expect(restored.contentHashAfter).toBe(original.contentHashAfter);
    expect(restored.semanticChanges).toHaveLength(1);
    expect(restored.rawDiff).toBe(original.rawDiff);
  });

  it('should handle missing optional completedAt', () => {
    const original: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };

    const dict = taskSnapshotToDict(original);
    const restored = taskSnapshotFromDict(dict);

    expect(restored.completedAt).toBeUndefined();
  });

  it('should handle missing optional rawDiff', () => {
    const original: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };

    const dict = taskSnapshotToDict(original);
    const restored = taskSnapshotFromDict(dict);

    expect(restored.rawDiff).toBeUndefined();
  });
});

// ============================================
// FileEvolution Helpers
// ============================================

describe('fileEvolutionToDict and fileEvolutionFromDict', () => {
  it('should round-trip correctly', () => {
    const original: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc123',
      baselineCapturedAt: new Date('2024-01-01T10:00:00Z'),
      baselineContentHash: 'hash123',
      baselineSnapshotPath: '/snapshots/baseline.json',
      taskSnapshots: [
        {
          taskId: 'task-1',
          taskIntent: 'Add feature',
          startedAt: new Date('2024-01-01T11:00:00Z'),
          contentHashBefore: 'hash123',
          contentHashAfter: 'hash456',
          semanticChanges: [],
        },
      ],
    };

    const dict = fileEvolutionToDict(original);
    const restored = fileEvolutionFromDict(dict);

    expect(restored.filePath).toBe(original.filePath);
    expect(restored.baselineCommit).toBe(original.baselineCommit);
    expect(restored.baselineCapturedAt.toISOString()).toBe(original.baselineCapturedAt.toISOString());
    expect(restored.baselineContentHash).toBe(original.baselineContentHash);
    expect(restored.baselineSnapshotPath).toBe(original.baselineSnapshotPath);
    expect(restored.taskSnapshots).toHaveLength(1);
  });
});

describe('getTaskSnapshot', () => {
  it('should return task snapshot when found', () => {
    const snapshot1: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };
    const snapshot2: TaskSnapshot = {
      taskId: 'task-2',
      taskIntent: 'Fix bug',
      startedAt: new Date('2024-01-01T11:00:00Z'),
      contentHashBefore: 'def',
      contentHashAfter: 'ghi',
      semanticChanges: [],
    };

    const evolution: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc',
      baselineCapturedAt: new Date(),
      baselineContentHash: 'hash',
      baselineSnapshotPath: '/path',
      taskSnapshots: [snapshot1, snapshot2],
    };

    const result = getTaskSnapshot(evolution, 'task-2');

    expect(result).toBe(snapshot2);
  });

  it('should return undefined when not found', () => {
    const evolution: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc',
      baselineCapturedAt: new Date(),
      baselineContentHash: 'hash',
      baselineSnapshotPath: '/path',
      taskSnapshots: [],
    };

    const result = getTaskSnapshot(evolution, 'task-1');

    expect(result).toBeUndefined();
  });
});

describe('addTaskSnapshot', () => {
  it('should add new snapshot', () => {
    const snapshot1: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };
    const snapshot2: TaskSnapshot = {
      taskId: 'task-2',
      taskIntent: 'Fix bug',
      startedAt: new Date('2024-01-01T11:00:00Z'),
      contentHashBefore: 'def',
      contentHashAfter: 'ghi',
      semanticChanges: [],
    };

    const evolution: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc',
      baselineCapturedAt: new Date(),
      baselineContentHash: 'hash',
      baselineSnapshotPath: '/path',
      taskSnapshots: [snapshot1],
    };

    addTaskSnapshot(evolution, snapshot2);

    expect(evolution.taskSnapshots).toHaveLength(2);
  });

  it('should replace existing snapshot with same task ID', () => {
    const snapshot1: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };
    const snapshot1Updated: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature (updated)',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      completedAt: new Date('2024-01-01T10:30:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'xyz',
      semanticChanges: [],
    };

    const evolution: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc',
      baselineCapturedAt: new Date(),
      baselineContentHash: 'hash',
      baselineSnapshotPath: '/path',
      taskSnapshots: [snapshot1],
    };

    addTaskSnapshot(evolution, snapshot1Updated);

    expect(evolution.taskSnapshots).toHaveLength(1);
    expect(evolution.taskSnapshots[0].taskIntent).toBe('Add feature (updated)');
    expect(evolution.taskSnapshots[0].contentHashAfter).toBe('xyz');
  });

  it('should sort snapshots by start time', () => {
    const snapshot1: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'First',
      startedAt: new Date('2024-01-01T11:00:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };
    const snapshot2: TaskSnapshot = {
      taskId: 'task-2',
      taskIntent: 'Second',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      contentHashBefore: 'def',
      contentHashAfter: 'ghi',
      semanticChanges: [],
    };
    const snapshot3: TaskSnapshot = {
      taskId: 'task-3',
      taskIntent: 'Third',
      startedAt: new Date('2024-01-01T12:00:00Z'),
      contentHashBefore: 'ghi',
      contentHashAfter: 'jkl',
      semanticChanges: [],
    };

    const evolution: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc',
      baselineCapturedAt: new Date(),
      baselineContentHash: 'hash',
      baselineSnapshotPath: '/path',
      taskSnapshots: [snapshot3, snapshot1],
    };

    addTaskSnapshot(evolution, snapshot2);

    expect(evolution.taskSnapshots).toHaveLength(3);
    expect(evolution.taskSnapshots[0].taskId).toBe('task-2');
    expect(evolution.taskSnapshots[1].taskId).toBe('task-1');
    expect(evolution.taskSnapshots[2].taskId).toBe('task-3');
  });
});

describe('getTasksInvolved', () => {
  it('should return list of task IDs', () => {
    const snapshot1: TaskSnapshot = {
      taskId: 'task-1',
      taskIntent: 'Add feature',
      startedAt: new Date('2024-01-01T10:00:00Z'),
      contentHashBefore: 'abc',
      contentHashAfter: 'def',
      semanticChanges: [],
    };
    const snapshot2: TaskSnapshot = {
      taskId: 'task-2',
      taskIntent: 'Fix bug',
      startedAt: new Date('2024-01-01T11:00:00Z'),
      contentHashBefore: 'def',
      contentHashAfter: 'ghi',
      semanticChanges: [],
    };

    const evolution: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc',
      baselineCapturedAt: new Date(),
      baselineContentHash: 'hash',
      baselineSnapshotPath: '/path',
      taskSnapshots: [snapshot1, snapshot2],
    };

    const tasks = getTasksInvolved(evolution);

    expect(tasks).toEqual(['task-1', 'task-2']);
  });

  it('should return empty array for no snapshots', () => {
    const evolution: FileEvolution = {
      filePath: 'src/file.ts',
      baselineCommit: 'abc',
      baselineCapturedAt: new Date(),
      baselineContentHash: 'hash',
      baselineSnapshotPath: '/path',
      taskSnapshots: [],
    };

    const tasks = getTasksInvolved(evolution);

    expect(tasks).toEqual([]);
  });
});

// ============================================
// MergeResult Helpers
// ============================================

describe('mergeResultSuccess', () => {
  it('should return true for AUTO_MERGED', () => {
    const result: MergeResult = {
      decision: MergeDecision.AUTO_MERGED,
      filePath: 'src/file.ts',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 0,
      tokensUsed: 0,
      explanation: 'Auto-merged successfully',
    };

    expect(mergeResultSuccess(result)).toBe(true);
  });

  it('should return true for AI_MERGED', () => {
    const result: MergeResult = {
      decision: MergeDecision.AI_MERGED,
      filePath: 'src/file.ts',
      mergedContent: 'merged code',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 2,
      tokensUsed: 1000,
      explanation: 'AI merged successfully',
    };

    expect(mergeResultSuccess(result)).toBe(true);
  });

  it('should return true for DIRECT_COPY', () => {
    const result: MergeResult = {
      decision: MergeDecision.DIRECT_COPY,
      filePath: 'src/file.ts',
      mergedContent: 'copied content',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 0,
      tokensUsed: 0,
      explanation: 'Direct copy - no conflicts',
    };

    expect(mergeResultSuccess(result)).toBe(true);
  });

  it('should return false for NEEDS_HUMAN_REVIEW', () => {
    const result: MergeResult = {
      decision: MergeDecision.NEEDS_HUMAN_REVIEW,
      filePath: 'src/file.ts',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 0,
      tokensUsed: 0,
      explanation: 'Requires human review',
    };

    expect(mergeResultSuccess(result)).toBe(false);
  });

  it('should return false for FAILED', () => {
    const result: MergeResult = {
      decision: MergeDecision.FAILED,
      filePath: 'src/file.ts',
      error: 'Merge failed',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 0,
      tokensUsed: 0,
      explanation: 'Merge operation failed',
    };

    expect(mergeResultSuccess(result)).toBe(false);
  });
});

describe('mergeResultNeedsHumanReview', () => {
  it('should return true when conflicts remain', () => {
    const result: MergeResult = {
      decision: MergeDecision.AUTO_MERGED,
      filePath: 'src/file.ts',
      mergedContent: 'partial merge',
      conflictsResolved: [],
      conflictsRemaining: [
        {
          filePath: 'src/file.ts',
          location: 'line 10',
          tasksInvolved: ['task-1', 'task-2'],
          changeTypes: [ChangeType.MODIFY_FUNCTION],
          severity: ConflictSeverity.HIGH,
          canAutoMerge: false,
          reason: 'Conflict remains',
        },
      ],
      aiCallsMade: 0,
      tokensUsed: 0,
      explanation: 'Partial merge with conflicts',
    };

    expect(mergeResultNeedsHumanReview(result)).toBe(true);
  });

  it('should return true when decision is NEEDS_HUMAN_REVIEW', () => {
    const result: MergeResult = {
      decision: MergeDecision.NEEDS_HUMAN_REVIEW,
      filePath: 'src/file.ts',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 0,
      tokensUsed: 0,
      explanation: 'Requires human review',
    };

    expect(mergeResultNeedsHumanReview(result)).toBe(true);
  });

  it('should return false for successful auto merge', () => {
    const result: MergeResult = {
      decision: MergeDecision.AUTO_MERGED,
      filePath: 'src/file.ts',
      mergedContent: 'merged code',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 0,
      tokensUsed: 0,
      explanation: 'Auto-merged successfully',
    };

    expect(mergeResultNeedsHumanReview(result)).toBe(false);
  });

  it('should return false for successful AI merge', () => {
    const result: MergeResult = {
      decision: MergeDecision.AI_MERGED,
      filePath: 'src/file.ts',
      mergedContent: 'merged code',
      conflictsResolved: [],
      conflictsRemaining: [],
      aiCallsMade: 2,
      tokensUsed: 1000,
      explanation: 'AI merged successfully',
    };

    expect(mergeResultNeedsHumanReview(result)).toBe(false);
  });
});

// ============================================
// Utility Functions
// ============================================

describe('computeContentHash', () => {
  it('should compute consistent hash for same content', () => {
    const content = 'const x = 42;';

    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16); // First 16 chars of sha256
  });

  it('should compute different hashes for different content', () => {
    const hash1 = computeContentHash('const x = 42;');
    const hash2 = computeContentHash('const x = 43;');

    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = computeContentHash('');

    expect(hash).toHaveLength(16);
  });

  it('should handle large content', () => {
    const content = 'x'.repeat(10000);

    const hash = computeContentHash(content);

    expect(hash).toHaveLength(16);
  });
});

describe('sanitizePathForStorage', () => {
  it('should replace forward slashes with underscores', () => {
    const result = sanitizePathForStorage('src/components/Button.tsx');

    expect(result).toBe('src_components_Button_tsx');
  });

  it('should replace backslashes with underscores', () => {
    const result = sanitizePathForStorage('src\\components\\Button.tsx');

    expect(result).toBe('src_components_Button_tsx');
  });

  it('should replace dots with underscores', () => {
    const result = sanitizePathForStorage('src/components/Button.tsx');

    // All dots are replaced with underscores
    expect(result).not.toContain('.');
  });

  it('should handle mixed separators', () => {
    const result = sanitizePathForStorage('src/components\\nested/file.ts');

    expect(result).toBe('src_components_nested_file_ts');
  });

  it('should handle paths with multiple extensions', () => {
    const result = sanitizePathForStorage('path/to/file.test.ts');

    expect(result).not.toContain('.');
  });
});
