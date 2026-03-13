/**
 * Conflict Detector Tests
 *
 * Tests for rule-based conflict detection between task changes.
 * Covers 80+ compatibility rules, severity assessment, and merge strategy selection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConflictDetector,
  analyzeChangeCompatibility,
  type CompatibilityRule,
} from '../conflict-detector';
import {
  ChangeType,
  ConflictSeverity,
  MergeStrategy,
  type FileAnalysis,
  type SemanticChange,
  type ConflictRegion,
} from '../types';

describe('ConflictDetector', () => {
  let detector: ConflictDetector;

  beforeEach(() => {
    detector = new ConflictDetector();
  });

  describe('constructor', () => {
    it('should initialize with default rules', () => {
      expect(detector).toBeDefined();
      expect(detector.getCompatiblePairs().length).toBeGreaterThan(0);
    });

    it('should have rules for common change type combinations', () => {
      const compatiblePairs = detector.getCompatiblePairs();
      const ruleKeys = compatiblePairs.map(([a, b]) => `${a}+${b}`);

      expect(ruleKeys).toContain('add_import+add_import');
      expect(ruleKeys).toContain('add_function+add_function');
      expect(ruleKeys).toContain('add_hook_call+add_hook_call');
    });
  });

  describe('analyzeCompatibility', () => {
    it('should detect compatible import additions', () => {
      const changeA: SemanticChange = {
        changeType: ChangeType.ADD_IMPORT,
        target: 'useState',
        location: 'src/test.ts:1',
        lineStart: 1,
        lineEnd: 1,
        contentAfter: 'import { useState } from "react";',
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.ADD_IMPORT,
        target: 'useEffect',
        location: 'src/test.ts:2',
        lineStart: 2,
        lineEnd: 2,
        contentAfter: 'import { useEffect } from "react";',
        metadata: {},
      };

      const [compatible, strategy, reason] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.COMBINE_IMPORTS);
      expect(reason).toContain('compatible');
    });

    it('should detect incompatible import modifications', () => {
      const changeA: SemanticChange = {
        changeType: ChangeType.ADD_IMPORT,
        target: 'foo',
        location: 'src/test.ts:1',
        lineStart: 1,
        lineEnd: 1,
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.REMOVE_IMPORT,
        target: 'foo',
        location: 'src/test.ts:1',
        lineStart: 1,
        lineEnd: 1,
        metadata: {},
      };

      const [compatible, strategy, reason] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(false);
      expect(strategy).toBe(MergeStrategy.AI_REQUIRED);
      expect(reason).toContain('conflict');
    });

    it('should detect compatible function additions', () => {
      const changeA: SemanticChange = {
        changeType: ChangeType.ADD_FUNCTION,
        target: 'funcA',
        location: 'src/test.ts:10',
        lineStart: 10,
        lineEnd: 15,
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.ADD_FUNCTION,
        target: 'funcB',
        location: 'src/test.ts:16',
        lineStart: 16,
        lineEnd: 20,
        metadata: {},
      };

      const [compatible, strategy] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.APPEND_FUNCTIONS);
    });

    it('should detect incompatible function modifications', () => {
      const changeA: SemanticChange = {
        changeType: ChangeType.MODIFY_FUNCTION,
        target: 'myFunc',
        location: 'src/test.ts:10',
        lineStart: 10,
        lineEnd: 15,
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.MODIFY_FUNCTION,
        target: 'myFunc',
        location: 'src/test.ts:10',
        lineStart: 10,
        lineEnd: 15,
        metadata: {},
      };

      const [compatible, strategy] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(false);
      expect(strategy).toBe(MergeStrategy.AI_REQUIRED);
    });

    it('should detect compatible hook additions', () => {
      const changeA: SemanticChange = {
        changeType: ChangeType.ADD_HOOK_CALL,
        target: 'Component',
        location: 'src/test.ts:5',
        lineStart: 5,
        lineEnd: 5,
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.ADD_HOOK_CALL,
        target: 'Component',
        location: 'src/test.ts:6',
        lineStart: 6,
        lineEnd: 6,
        metadata: {},
      };

      const [compatible, strategy] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.ORDER_BY_DEPENDENCY);
    });

    it('should detect compatible hook and wrap combination', () => {
      const changeA: SemanticChange = {
        changeType: ChangeType.ADD_HOOK_CALL,
        target: 'Component',
        location: 'src/test.ts:5',
        lineStart: 5,
        lineEnd: 5,
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.WRAP_JSX,
        target: 'Component',
        location: 'src/test.ts:10',
        lineStart: 10,
        lineEnd: 10,
        metadata: {},
      };

      const [compatible, strategy] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.HOOKS_THEN_WRAP);
    });

    it('should return AI_REQUIRED for unknown combinations', () => {
      const changeA: SemanticChange = {
        changeType: ChangeType.UNKNOWN,
        target: 'unknown',
        location: 'src/test.ts:1',
        lineStart: 1,
        lineEnd: 1,
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.ADD_FUNCTION,
        target: 'func',
        location: 'src/test.ts:2',
        lineStart: 2,
        lineEnd: 2,
        metadata: {},
      };

      const [compatible, strategy, reason] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(false);
      expect(strategy).toBe(MergeStrategy.AI_REQUIRED);
      expect(reason).toContain('No compatibility rule');
    });
  });

  describe('detectConflicts', () => {
    it('should return empty array for single task', () => {
      const analysis: FileAnalysis = {
        filePath: 'src/test.ts',
        changes: [
          {
            changeType: ChangeType.ADD_FUNCTION,
            target: 'newFunc',
            location: 'src/test.ts:10',
            lineStart: 10,
            lineEnd: 15,
            contentAfter: 'function newFunc() {}',
            metadata: {},
          },
        ],
        functionsModified: new Set(),
        functionsAdded: new Set(['newFunc']),
        importsAdded: new Set(),
        importsRemoved: new Set(),
        classesModified: new Set(),
        totalLinesChanged: 5,
      };

      const taskAnalyses = new Map([['task-1', analysis]]);

      const conflicts = detector.detectConflicts(taskAnalyses);

      expect(conflicts).toEqual([]);
    });

    it('should detect conflicts at same location', () => {
      const analysis1: FileAnalysis = {
        filePath: 'src/test.ts',
        changes: [
          {
            changeType: ChangeType.MODIFY_FUNCTION,
            target: 'myFunc',
            location: 'src/test.ts:10',
            lineStart: 10,
            lineEnd: 15,
            contentBefore: 'old',
            contentAfter: 'new1',
            metadata: {},
          },
        ],
        functionsModified: new Set(['myFunc']),
        functionsAdded: new Set(),
        importsAdded: new Set(),
        importsRemoved: new Set(),
        classesModified: new Set(),
        totalLinesChanged: 5,
      };

      const analysis2: FileAnalysis = {
        filePath: 'src/test.ts',
        changes: [
          {
            changeType: ChangeType.MODIFY_FUNCTION,
            target: 'myFunc',
            location: 'src/test.ts:10',
            lineStart: 10,
            lineEnd: 15,
            contentBefore: 'old',
            contentAfter: 'new2',
            metadata: {},
          },
        ],
        functionsModified: new Set(['myFunc']),
        functionsAdded: new Set(),
        importsAdded: new Set(),
        importsRemoved: new Set(),
        classesModified: new Set(),
        totalLinesChanged: 5,
      };

      const taskAnalyses = new Map([
        ['task-1', analysis1],
        ['task-2', analysis2],
      ]);

      const conflicts = detector.detectConflicts(taskAnalyses);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].canAutoMerge).toBe(false);
      expect(conflicts[0].tasksInvolved).toContain('task-1');
      expect(conflicts[0].tasksInvolved).toContain('task-2');
    });

    it('should detect compatible changes at different locations', () => {
      const analysis1: FileAnalysis = {
        filePath: 'src/test.ts',
        changes: [
          {
            changeType: ChangeType.ADD_FUNCTION,
            target: 'funcA',
            location: 'src/test.ts:10',
            lineStart: 10,
            lineEnd: 15,
            contentAfter: 'function funcA() {}',
            metadata: {},
          },
        ],
        functionsModified: new Set(),
        functionsAdded: new Set(['funcA']),
        importsAdded: new Set(),
        importsRemoved: new Set(),
        classesModified: new Set(),
        totalLinesChanged: 5,
      };

      const analysis2: FileAnalysis = {
        filePath: 'src/test.ts',
        changes: [
          {
            changeType: ChangeType.ADD_FUNCTION,
            target: 'funcB',
            location: 'src/test.ts:20',
            lineStart: 20,
            lineEnd: 25,
            contentAfter: 'function funcB() {}',
            metadata: {},
          },
        ],
        functionsModified: new Set(),
        functionsAdded: new Set(['funcB']),
        importsAdded: new Set(),
        importsRemoved: new Set(),
        classesModified: new Set(),
        totalLinesChanged: 5,
      };

      const taskAnalyses = new Map([
        ['task-1', analysis1],
        ['task-2', analysis2],
      ]);

      const conflicts = detector.detectConflicts(taskAnalyses);

      // Different locations should not create conflicts
      expect(conflicts).toHaveLength(0);
    });

    it('should detect compatible changes at same location', () => {
      const analysis1: FileAnalysis = {
        filePath: 'src/test.ts',
        changes: [
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
        functionsModified: new Set(),
        functionsAdded: new Set(),
        importsAdded: new Set(['useState']),
        importsRemoved: new Set(),
        classesModified: new Set(),
        totalLinesChanged: 1,
      };

      const analysis2: FileAnalysis = {
        filePath: 'src/test.ts',
        changes: [
          {
            changeType: ChangeType.ADD_IMPORT,
            target: 'useEffect',
            location: 'src/test.ts:1', // Same location
            lineStart: 1,
            lineEnd: 1,
            contentAfter: 'import { useEffect } from "react";',
            metadata: {},
          },
        ],
        functionsModified: new Set(),
        functionsAdded: new Set(),
        importsAdded: new Set(['useEffect']),
        importsRemoved: new Set(),
        classesModified: new Set(),
        totalLinesChanged: 1,
      };

      const taskAnalyses = new Map([
        ['task-1', analysis1],
        ['task-2', analysis2],
      ]);

      const conflicts = detector.detectConflicts(taskAnalyses);

      // When changes have different targets at the same location, no conflict is detected
      // (they're considered independent changes to different things)
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('addRule', () => {
    it('should add custom compatibility rule', () => {
      const customRule: CompatibilityRule = {
        changeTypeA: ChangeType.ADD_FUNCTION,
        changeTypeB: ChangeType.ADD_CLASS,
        compatible: true,
        strategy: MergeStrategy.APPEND_FUNCTIONS,
        reason: 'Custom rule',
        bidirectional: true,
      };

      detector.addRule(customRule);

      const changeA: SemanticChange = {
        changeType: ChangeType.ADD_FUNCTION,
        target: 'func',
        location: 'src/test.ts:1',
        lineStart: 1,
        lineEnd: 1,
        metadata: {},
      };
      const changeB: SemanticChange = {
        changeType: ChangeType.ADD_CLASS,
        target: 'MyClass',
        location: 'src/test.ts:2',
        lineStart: 2,
        lineEnd: 2,
        metadata: {},
      };

      const [compatible, strategy, reason] = detector.analyzeCompatibility(changeA, changeB);

      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.APPEND_FUNCTIONS);
      expect(reason).toBe('Custom rule');
    });
  });

  describe('explainConflict', () => {
    it('should generate human-readable conflict explanation', () => {
      const conflict: ConflictRegion = {
        filePath: 'src/test.ts',
        location: 'src/test.ts:10',
        tasksInvolved: ['task-1', 'task-2'],
        changeTypes: [ChangeType.MODIFY_FUNCTION, ChangeType.MODIFY_FUNCTION],
        severity: ConflictSeverity.HIGH,
        canAutoMerge: false,
        mergeStrategy: MergeStrategy.AI_REQUIRED,
        reason: 'Multiple modifications to same function need analysis',
      };

      const explanation = detector.explainConflict(conflict);

      expect(explanation).toContain('src/test.ts');
      expect(explanation).toContain('task-1');
      expect(explanation).toContain('task-2');
      // ChangeType enum values are snake_case strings
      expect(explanation).toContain('modify_function');
      expect(explanation).toContain('high');
      expect(explanation).toContain('ai_required');
    });
  });

  describe('getCompatiblePairs', () => {
    it('should return all compatible change type pairs', () => {
      const pairs = detector.getCompatiblePairs();

      expect(pairs.length).toBeGreaterThan(40); // 80+ rules, about half compatible

      // Each pair should have 3 elements: [typeA, typeB, strategy]
      pairs.forEach(([typeA, typeB, strategy]) => {
        expect(typeA).toBeDefined();
        expect(typeB).toBeDefined();
        expect(strategy).toBeDefined();
      });
    });

    it('should include all expected merge strategies', () => {
      const pairs = detector.getCompatiblePairs();
      const strategies = new Set(pairs.map(([, , s]) => s));

      expect(strategies.has(MergeStrategy.COMBINE_IMPORTS)).toBe(true);
      expect(strategies.has(MergeStrategy.APPEND_FUNCTIONS)).toBe(true);
      expect(strategies.has(MergeStrategy.HOOKS_FIRST)).toBe(true);
      expect(strategies.has(MergeStrategy.APPEND_METHODS)).toBe(true);
      expect(strategies.has(MergeStrategy.ORDER_BY_DEPENDENCY)).toBe(true);
    });
  });
});

describe('analyzeChangeCompatibility convenience function', () => {
  it('should work without providing detector', () => {
    const changeA: SemanticChange = {
      changeType: ChangeType.ADD_IMPORT,
      target: 'foo',
      location: 'src/test.ts:1',
      lineStart: 1,
      lineEnd: 1,
      metadata: {},
    };
    const changeB: SemanticChange = {
      changeType: ChangeType.ADD_IMPORT,
      target: 'bar',
      location: 'src/test.ts:2',
      lineStart: 2,
      lineEnd: 2,
      metadata: {},
    };

    const [compatible, strategy] = analyzeChangeCompatibility(changeA, changeB);

    expect(compatible).toBe(true);
    expect(strategy).toBe(MergeStrategy.COMBINE_IMPORTS);
  });

  it('should use provided detector', () => {
    const customDetector = new ConflictDetector();
    const customRule: CompatibilityRule = {
      changeTypeA: ChangeType.ADD_IMPORT,
      changeTypeB: ChangeType.REMOVE_IMPORT,
      compatible: true,
      strategy: MergeStrategy.COMBINE_IMPORTS,
      reason: 'Custom override',
      bidirectional: false,
    };
    customDetector.addRule(customRule);

    const changeA: SemanticChange = {
      changeType: ChangeType.ADD_IMPORT,
      target: 'foo',
      location: 'src/test.ts:1',
      lineStart: 1,
      lineEnd: 1,
      metadata: {},
    };
    const changeB: SemanticChange = {
      changeType: ChangeType.REMOVE_IMPORT,
      target: 'foo',
      location: 'src/test.ts:1',
      lineStart: 1,
      lineEnd: 1,
      metadata: {},
    };

    const [compatible, strategy, reason] = analyzeChangeCompatibility(changeA, changeB, customDetector);

    expect(compatible).toBe(true);
    expect(reason).toBe('Custom override');
  });
});

describe('Rule categories', () => {
  let detector: ConflictDetector;

  beforeEach(() => {
    detector = new ConflictDetector();
  });

  describe('Import rules', () => {
    it('should allow combining import additions', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.ADD_IMPORT, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.ADD_IMPORT, target: '', location: '', lineStart: 2, lineEnd: 2, metadata: {} },
      );
      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.COMBINE_IMPORTS);
    });

    it('should flag import add/remove conflicts', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.ADD_IMPORT, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.REMOVE_IMPORT, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
      );
      expect(compatible).toBe(false);
      expect(strategy).toBe(MergeStrategy.AI_REQUIRED);
    });
  });

  describe('React hook rules', () => {
    it('should allow multiple hook additions', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.ADD_HOOK_CALL, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.ADD_HOOK_CALL, target: '', location: '', lineStart: 2, lineEnd: 2, metadata: {} },
      );
      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.ORDER_BY_DEPENDENCY);
    });

    it('should allow hooks before JSX wrap', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.ADD_HOOK_CALL, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.WRAP_JSX, target: '', location: '', lineStart: 10, lineEnd: 10, metadata: {} },
      );
      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.HOOKS_THEN_WRAP);
    });
  });

  describe('JSX rules', () => {
    it('should allow multiple JSX wraps', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.WRAP_JSX, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.WRAP_JSX, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
      );
      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.ORDER_BY_DEPENDENCY);
    });

    it('should flag wrap/unwrap conflicts', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.WRAP_JSX, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.UNWRAP_JSX, target: '', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
      );
      expect(compatible).toBe(false);
      expect(strategy).toBe(MergeStrategy.AI_REQUIRED);
    });
  });

  describe('Class/Method rules', () => {
    it('should allow adding different methods', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.ADD_METHOD, target: 'methodA', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.ADD_METHOD, target: 'methodB', location: '', lineStart: 2, lineEnd: 2, metadata: {} },
      );
      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.APPEND_METHODS);
    });

    it('should flag multiple method modifications', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.MODIFY_METHOD, target: 'method', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.MODIFY_METHOD, target: 'method', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
      );
      expect(compatible).toBe(false);
      expect(strategy).toBe(MergeStrategy.AI_REQUIRED);
    });
  });

  describe('Type rules', () => {
    it('should allow adding different types', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.ADD_TYPE, target: 'TypeA', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.ADD_TYPE, target: 'TypeB', location: '', lineStart: 2, lineEnd: 2, metadata: {} },
      );
      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.APPEND_FUNCTIONS);
    });

    it('should flag multiple interface modifications', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.MODIFY_INTERFACE, target: 'IFace', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.MODIFY_INTERFACE, target: 'IFace', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
      );
      expect(compatible).toBe(false);
      expect(strategy).toBe(MergeStrategy.AI_REQUIRED);
    });
  });

  describe('Python decorator rules', () => {
    it('should allow stacking decorators', () => {
      const [compatible, strategy] = detector.analyzeCompatibility(
        { changeType: ChangeType.ADD_DECORATOR, target: 'func', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
        { changeType: ChangeType.ADD_DECORATOR, target: 'func', location: '', lineStart: 1, lineEnd: 1, metadata: {} },
      );
      expect(compatible).toBe(true);
      expect(strategy).toBe(MergeStrategy.ORDER_BY_DEPENDENCY);
    });
  });
});
