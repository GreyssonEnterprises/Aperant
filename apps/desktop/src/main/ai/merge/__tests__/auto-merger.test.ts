/**
 * Auto Merger Tests
 *
 * Tests for deterministic merge strategies without AI.
 * Covers all 9 merge strategies, helper functions, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutoMerger,
  type MergeContext,
} from '../auto-merger';
import {
  ChangeType,
  MergeDecision,
  MergeStrategy,
  ConflictSeverity,
  type TaskSnapshot,
  computeContentHash,
} from '../types';

describe('AutoMerger', () => {
  let merger: AutoMerger;
  const mockFilePath = 'src/test.ts';
  const mockBaseline = 'export function test() {\n  return "test";\n}';

  beforeEach(() => {
    merger = new AutoMerger();
  });

  describe('constructor', () => {
    it('should initialize with all strategy handlers', () => {
      expect(merger).toBeDefined();

      // Test that all expected strategies are supported
      expect(merger.canHandle(MergeStrategy.COMBINE_IMPORTS)).toBe(true);
      expect(merger.canHandle(MergeStrategy.HOOKS_FIRST)).toBe(true);
      expect(merger.canHandle(MergeStrategy.HOOKS_THEN_WRAP)).toBe(true);
      expect(merger.canHandle(MergeStrategy.APPEND_FUNCTIONS)).toBe(true);
      expect(merger.canHandle(MergeStrategy.APPEND_METHODS)).toBe(true);
      expect(merger.canHandle(MergeStrategy.COMBINE_PROPS)).toBe(true);
      expect(merger.canHandle(MergeStrategy.ORDER_BY_DEPENDENCY)).toBe(true);
      expect(merger.canHandle(MergeStrategy.ORDER_BY_TIME)).toBe(true);
      expect(merger.canHandle(MergeStrategy.APPEND_STATEMENTS)).toBe(true);
    });

    it('should return false for unknown strategies', () => {
      expect(merger.canHandle(MergeStrategy.AI_REQUIRED)).toBe(false);
      expect(merger.canHandle(MergeStrategy.HUMAN_REQUIRED)).toBe(false);
    });
  });

  describe('COMBINE_IMPORTS strategy', () => {
    it('should add new imports to existing content', () => {
      const baseline = 'export function test() {}\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add useState',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline + 'import { useState } from "react";\n'),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_IMPORT,
              target: 'useState',
              location: 'src/test.ts:1',
              lineStart: 1,
              lineEnd: 1,
              contentAfter: 'import { useState } from "react";',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_IMPORT],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_IMPORTS,
          reason: 'Import changes',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).toContain('import { useState } from "react";');
      expect(result.mergedContent).toContain('export function test()');
      expect(result.conflictsResolved).toHaveLength(1);
      expect(result.conflictsRemaining).toHaveLength(0);
      expect(result.aiCallsMade).toBe(0);
    });

    it('should remove imports specified for removal', () => {
      const baseline = 'import { foo } from "bar";\nexport function test() {}\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Remove unused import',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash('export function test() {}\n'),
          semanticChanges: [
            {
              changeType: ChangeType.REMOVE_IMPORT,
              target: 'foo',
              location: 'src/test.ts:1',
              lineStart: 1,
              lineEnd: 1,
              contentBefore: 'import { foo } from "bar";',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.REMOVE_IMPORT],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_IMPORTS,
          reason: 'Import removal',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).not.toContain('import { foo }');
      expect(result.mergedContent).toContain('export function test()');
    });

    it('should detect Python imports correctly', () => {
      const baseline = 'def test():\n    pass\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add os import',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash('import os\n\ndef test():\n    pass\n'),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_IMPORT,
              target: 'os',
              location: 'test.py:1',
              lineStart: 1,
              lineEnd: 1,
              contentAfter: 'import os',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: 'test.py',
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: 'test.py',
          location: 'test.py:1',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_IMPORT],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_IMPORTS,
          reason: 'Python import',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).toContain('import os');
      expect(result.mergedContent).toContain('def test()');
    });

    it('should skip duplicate imports', () => {
      const baseline = 'import { foo } from "bar";\nexport function test() {}\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add same import',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline), // No actual change
          semanticChanges: [
            {
              changeType: ChangeType.ADD_IMPORT,
              target: 'foo',
              location: 'src/test.ts:1',
              lineStart: 1,
              lineEnd: 1,
              contentAfter: 'import { foo } from "bar";',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_IMPORT],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_IMPORTS,
          reason: 'Duplicate check',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      // Should only have one instance of the import
      const importCount = (result.mergedContent?.match(/import \{ foo \}/g) || []).length;
      expect(importCount).toBe(1);
    });
  });

  describe('HOOKS_FIRST strategy', () => {
    it('should insert hooks at the start of a function', () => {
      const baseline = 'function Component() {\n  return <div>Test</div>;\n}\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add useState hook',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(
            'function Component() {\n  const [count, setCount] = useState(0);\n  return <div>Test</div>;\n}\n',
          ),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_HOOK_CALL,
              target: 'Component',
              location: 'src/test.ts:1',
              lineStart: 2,
              lineEnd: 2,
              contentAfter: 'const [count, setCount] = useState(0);',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'function:Component',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_HOOK_CALL],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.HOOKS_FIRST,
          reason: 'Hook addition',
        },
      };

      const result = merger.merge(context, MergeStrategy.HOOKS_FIRST);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      // extractHookCall extracts just the hook call part
      expect(result.mergedContent).toContain('useState(0)');
      expect(result.mergedContent).toContain('function Component()');
    });

    it('should insert hooks into arrow function component', () => {
      const baseline = 'const Component = () => {\n  return <div>Test</div>;\n};\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add useEffect hook',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(
            'const Component = () => {\n  useEffect(() => {}, []);\n  return <div>Test</div>;\n};\n',
          ),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_HOOK_CALL,
              target: 'Component',
              location: 'src/test.ts:1',
              lineStart: 2,
              lineEnd: 2,
              contentAfter: 'useEffect(() => {}, []);',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'function:Component',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_HOOK_CALL],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.HOOKS_FIRST,
          reason: 'Arrow function hook',
        },
      };

      const result = merger.merge(context, MergeStrategy.HOOKS_FIRST);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      // extractHookCall extracts just the hook call part (without destructuring)
      expect(result.mergedContent).toContain('useEffect(');
    });
  });

  describe('HOOKS_THEN_WRAP strategy', () => {
    it('should add hooks and wrap JSX return', () => {
      const baseline = 'function Component() {\n  return (\n    <div>Test</div>\n  );\n}\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add wrapper',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_HOOK_CALL,
              target: 'Component',
              location: 'src/test.ts:2',
              lineStart: 2,
              lineEnd: 2,
              contentAfter: 'const [data, setData] = useState(null);',
              metadata: {},
            },
            {
              changeType: ChangeType.WRAP_JSX,
              target: 'Component',
              location: 'src/test.ts:3',
              lineStart: 3,
              lineEnd: 3,
              contentAfter: '<Wrapper><div>Test</div></Wrapper>',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'function:Component',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_HOOK_CALL, ChangeType.WRAP_JSX],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.HOOKS_THEN_WRAP,
          reason: 'Hook and wrap',
        },
      };

      const result = merger.merge(context, MergeStrategy.HOOKS_THEN_WRAP);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      // extractHookCall extracts just the hook call part (without destructuring)
      expect(result.mergedContent).toContain('useState(');
      // Should also have the wrapper
      expect(result.mergedContent).toContain('<Wrapper>');
    });
  });

  describe('APPEND_FUNCTIONS strategy', () => {
    it('should append new functions before export default', () => {
      const baseline = 'function existing() {}\n\nexport default existing;\n';
      const newFunction = 'function newFunc() {\n  return "new";\n}';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add new function',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline + newFunction + '\n'),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_FUNCTION,
              target: 'newFunc',
              location: 'src/test.ts',
              lineStart: 3,
              lineEnd: 5,
              contentAfter: newFunction,
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_FUNCTION],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.APPEND_FUNCTIONS,
          reason: 'New function',
        },
      };

      const result = merger.merge(context, MergeStrategy.APPEND_FUNCTIONS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).toContain('function newFunc()');
      expect(result.mergedContent).toContain('function existing()');
    });

    it('should append functions when no export statement exists', () => {
      const baseline = 'function existing() {}\n';
      const newFunction = 'function newFunc() {\n  return "new";\n}';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add function',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_FUNCTION,
              target: 'newFunc',
              location: 'src/test.ts',
              lineStart: 2,
              lineEnd: 4,
              contentAfter: newFunction,
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_FUNCTION],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.APPEND_FUNCTIONS,
          reason: 'Append to end',
        },
      };

      const result = merger.merge(context, MergeStrategy.APPEND_FUNCTIONS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).toContain('function newFunc()');
    });
  });

  describe('APPEND_METHODS strategy', () => {
    it('should insert methods into class', () => {
      const baseline = 'class MyClass {\n  existing() {}\n}\n';
      const newMethod = '  newMethod() {\n    return "new";\n  }';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add method',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_METHOD,
              target: 'MyClass.newMethod',
              location: 'src/test.ts',
              lineStart: 3,
              lineEnd: 5,
              contentAfter: newMethod,
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'class:MyClass',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_METHOD],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.APPEND_METHODS,
          reason: 'New method',
        },
      };

      const result = merger.merge(context, MergeStrategy.APPEND_METHODS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).toContain('newMethod()');
    });
  });

  describe('COMBINE_PROPS strategy', () => {
    it('should apply content changes from snapshots', () => {
      const baseline = '<div className="test" />\n';
      const modified = '<div className="test" id="main" />\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add id prop',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(modified),
          semanticChanges: [
            {
              changeType: ChangeType.MODIFY_JSX_PROPS,
              target: 'div',
              location: 'src/test.ts:1',
              lineStart: 1,
              lineEnd: 1,
              contentBefore: baseline.trim(),
              contentAfter: modified.trim(),
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.MODIFY_JSX_PROPS],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_PROPS,
          reason: 'Props merge',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_PROPS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
    });
  });

  describe('ORDER_BY_DEPENDENCY strategy', () => {
    it('should apply changes in dependency order', () => {
      const baseline = 'function Component() {\n  return <div>Test</div>;\n}\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add imports and hooks',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_IMPORT,
              target: 'useState',
              location: 'src/test.ts:1',
              lineStart: 0,
              lineEnd: 0,
              contentAfter: 'import { useState } from "react";',
              metadata: {},
            },
            {
              changeType: ChangeType.ADD_HOOK_CALL,
              target: 'Component',
              location: 'src/test.ts:2',
              lineStart: 2,
              lineEnd: 2,
              contentAfter: 'const [count, setCount] = useState(0);',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_IMPORT, ChangeType.ADD_HOOK_CALL],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.ORDER_BY_DEPENDENCY,
          reason: 'Dependency order',
        },
      };

      const result = merger.merge(context, MergeStrategy.ORDER_BY_DEPENDENCY);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
    });
  });

  describe('ORDER_BY_TIME strategy', () => {
    it('should apply changes in chronological order', () => {
      const baseline = 'let value = "initial";\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'First change',
          startedAt: new Date('2024-01-01T10:00:00Z'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash('let value = "first";\n'),
          semanticChanges: [
            {
              changeType: ChangeType.MODIFY_VARIABLE,
              target: 'value',
              location: 'src/test.ts:1',
              lineStart: 1,
              lineEnd: 1,
              contentBefore: 'let value = "initial";',
              contentAfter: 'let value = "first";',
              metadata: {},
            },
          ],
        },
        {
          taskId: 'task-2',
          taskIntent: 'Second change',
          startedAt: new Date('2024-01-01T11:00:00Z'),
          contentHashBefore: computeContentHash('let value = "first";\n'),
          contentHashAfter: computeContentHash('let value = "second";\n'),
          semanticChanges: [
            {
              changeType: ChangeType.MODIFY_VARIABLE,
              target: 'value',
              location: 'src/test.ts:1',
              lineStart: 1,
              lineEnd: 1,
              contentBefore: 'let value = "first";',
              contentAfter: 'let value = "second";',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: ['task-1', 'task-2'],
          changeTypes: [ChangeType.MODIFY_VARIABLE],
          severity: ConflictSeverity.MEDIUM,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.ORDER_BY_TIME,
          reason: 'Time ordering',
        },
      };

      const result = merger.merge(context, MergeStrategy.ORDER_BY_TIME);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.explanation).toContain('chronological order');
    });
  });

  describe('APPEND_STATEMENTS strategy', () => {
    it('should append additive changes to content', () => {
      const baseline = 'function test() {\n  console.log("test");\n}\n';
      const addition = '  console.log("added");';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add logging',
          startedAt: new Date('2024-01-01'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_COMMENT,
              target: 'test',
              location: 'src/test.ts:3',
              lineStart: 3,
              lineEnd: 3,
              contentAfter: addition,
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts',
          tasksInvolved: ['task-1'],
          changeTypes: [ChangeType.ADD_COMMENT],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.APPEND_STATEMENTS,
          reason: 'Append statement',
        },
      };

      const result = merger.merge(context, MergeStrategy.APPEND_STATEMENTS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.explanation).toContain('Appended');
    });
  });

  describe('Error handling', () => {
    it('should return FAILED result for unknown strategy', () => {
      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: mockBaseline,
        taskSnapshots: [],
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: [],
          changeTypes: [],
          severity: ConflictSeverity.HIGH,
          canAutoMerge: false,
          reason: 'Unknown strategy test',
        },
      };

      const result = merger.merge(context, MergeStrategy.AI_REQUIRED);

      expect(result.decision).toBe(MergeDecision.FAILED);
      expect(result.error).toContain('No handler for strategy');
    });

    it('should handle exceptions gracefully', () => {
      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: null as unknown as string, // Invalid input
        taskSnapshots: [],
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: [],
          changeTypes: [],
          severity: ConflictSeverity.HIGH,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_IMPORTS,
          reason: 'Error test',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS);

      expect(result.decision).toBe(MergeDecision.FAILED);
      expect(result.error).toContain('Auto-merge failed');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty snapshots', () => {
      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: mockBaseline,
        taskSnapshots: [],
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: [],
          changeTypes: [],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_IMPORTS,
          reason: 'Empty test',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).toBe(mockBaseline);
    });

    it('should handle multiple tasks with same file', () => {
      const baseline = 'export function test() {}\n';
      const snapshots: TaskSnapshot[] = [
        {
          taskId: 'task-1',
          taskIntent: 'Add useState',
          startedAt: new Date('2024-01-01T10:00:00Z'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_IMPORT,
              target: 'useState',
              location: 'src/test.ts:1',
              lineStart: 0,
              lineEnd: 0,
              contentAfter: 'import { useState } from "react";',
              metadata: {},
            },
          ],
        },
        {
          taskId: 'task-2',
          taskIntent: 'Add useEffect',
          startedAt: new Date('2024-01-01T11:00:00Z'),
          contentHashBefore: computeContentHash(baseline),
          contentHashAfter: computeContentHash(baseline),
          semanticChanges: [
            {
              changeType: ChangeType.ADD_IMPORT,
              target: 'useEffect',
              location: 'src/test.ts:1',
              lineStart: 0,
              lineEnd: 0,
              contentAfter: 'import { useEffect } from "react";',
              metadata: {},
            },
          ],
        },
      ];

      const context: MergeContext = {
        filePath: mockFilePath,
        baselineContent: baseline,
        taskSnapshots: snapshots,
        conflict: {
          filePath: mockFilePath,
          location: 'src/test.ts:1',
          tasksInvolved: ['task-1', 'task-2'],
          changeTypes: [ChangeType.ADD_IMPORT],
          severity: ConflictSeverity.LOW,
          canAutoMerge: true,
          mergeStrategy: MergeStrategy.COMBINE_IMPORTS,
          reason: 'Multiple tasks',
        },
      };

      const result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS);

      expect(result.decision).toBe(MergeDecision.AUTO_MERGED);
      expect(result.mergedContent).toContain('import { useState }');
      expect(result.mergedContent).toContain('import { useEffect }');
      expect(result.explanation).toContain('2 tasks');
    });
  });
});
