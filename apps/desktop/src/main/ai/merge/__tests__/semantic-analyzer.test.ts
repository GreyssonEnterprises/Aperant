/**
 * Semantic Analyzer Tests
 *
 * Tests for regex-based semantic analysis of code changes.
 * Covers import detection, function detection, diff parsing, and change classification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SemanticAnalyzer, analyzeWithRegex } from '../semantic-analyzer';
import { ChangeType } from '../types';

describe('SemanticAnalyzer', () => {
  let analyzer: SemanticAnalyzer;

  beforeEach(() => {
    analyzer = new SemanticAnalyzer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create SemanticAnalyzer instance', () => {
      expect(analyzer).toBeInstanceOf(SemanticAnalyzer);
    });
  });

  describe('analyzeDiff', () => {
    it('should detect added imports in TypeScript', () => {
      const before = 'export function foo() {}';
      const after = 'import { useState } from "react";\n\nexport function foo() {}';

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result.importsAdded.size).toBe(1);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].changeType).toBe(ChangeType.ADD_IMPORT);
    });

    it('should detect added imports in Python', () => {
      const before = 'def foo():\n    pass';
      const after = 'import os\n\ndef foo():\n    pass';

      const result = analyzer.analyzeDiff('test.py', before, after);

      expect(result.importsAdded.size).toBe(1);
      expect(result.changes).toHaveLength(1);
    });

    it('should detect removed imports', () => {
      const before = 'import { foo } from "bar";\nexport function test() {}';
      const after = 'export function test() {}';

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result.importsRemoved.size).toBe(1);
      expect(result.changes[0].changeType).toBe(ChangeType.REMOVE_IMPORT);
    });

    it('should detect added functions in TypeScript', () => {
      const before = 'function foo() {}';
      const after = 'function foo() {}\n\nfunction bar() {}';

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result.functionsAdded.has('bar')).toBe(true);
      expect(result.changes.some(c => c.changeType === ChangeType.ADD_FUNCTION && c.target === 'bar')).toBe(true);
    });

    it('should detect added functions in Python', () => {
      const before = 'def foo():\n    pass';
      const after = 'def foo():\n    pass\n\ndef bar():\n    pass';

      const result = analyzer.analyzeDiff('test.py', before, after);

      expect(result.functionsAdded.has('bar')).toBe(true);
    });

    it('should detect removed functions', () => {
      const before = 'function foo() {}\n\nfunction bar() {}';
      const after = 'function foo() {}';

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result.changes.some(c => c.changeType === ChangeType.REMOVE_FUNCTION && c.target === 'bar')).toBe(true);
    });

    it('should track content changes', () => {
      // When function exists in both, content changes should be tracked
      const before = 'function Component() {\n  return <div>Test</div>;\n}';
      const after = 'function Component() {\n  const [count, setCount] = useState(0);\n  return <div>Test</div>;\n}';

      const result = analyzer.analyzeDiff('test.tsx', before, after);

      // Content changes are tracked in totalLinesChanged
      expect(result.totalLinesChanged).toBeGreaterThan(0);
    });

    it('should track JSX structure changes', () => {
      const before = 'function Component() {\n  return <div>Test</div>;\n}';
      const after = 'function Component() {\n  return <Wrapper><div>Test</div></Wrapper>;\n}';

      const result = analyzer.analyzeDiff('test.tsx', before, after);

      // Line changes are detected
      expect(result.totalLinesChanged).toBeGreaterThan(0);
    });

    it('should track prop changes', () => {
      const before = 'function Component() {\n  return <div className="test" />;\n}';
      const after = 'function Component() {\n  return <div className="test" id="main" />;\n}';

      const result = analyzer.analyzeDiff('test.tsx', before, after);

      // Line changes are tracked
      expect(result.totalLinesChanged).toBeGreaterThan(0);
    });

    it('should calculate totalLinesChanged correctly', () => {
      const before = 'line1\nline2\nline3';
      const after = 'line1\nmodified\nline3\nline4';

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result.totalLinesChanged).toBeGreaterThan(0);
    });
  });

  describe('analyzeFile', () => {
    it('should analyze single file content without diff', () => {
      const content = 'import { foo } from "bar";\n\nfunction test() {}';

      const result = analyzer.analyzeFile('test.ts', content);

      expect(result).toBeDefined();
      expect(result.filePath).toBe('test.ts');
    });
  });

  describe('analyzeWithRegex function', () => {
    it('should handle JavaScript files', () => {
      const before = 'function old() {}';
      const after = 'function old() {}\n\nfunction new() {}';

      const result = analyzeWithRegex('test.js', before, after);

      expect(result.functionsAdded.has('new')).toBe(true);
    });

    it('should handle JSX files', () => {
      const before = 'const App = function() {\n  return <div>Hello</div>;\n}';
      const after = 'const App = function() {\n  const [name, setName] = useState("");\n  return <div>Hello</div>;\n}';

      const result = analyzeWithRegex('test.jsx', before, after);

      // Content changes should be tracked in totalLinesChanged
      expect(result.totalLinesChanged).toBeGreaterThan(0);
    });

    it('should handle unsupported file extensions', () => {
      const result = analyzeWithRegex('test.unknown', 'content before', 'content after');

      expect(result.changes).toHaveLength(0);
    });

    it('should handle empty content', () => {
      const result = analyzeWithRegex('test.ts', '', '');

      expect(result.changes).toHaveLength(0);
    });

    it('should handle identical content', () => {
      const content = 'function test() {}';
      const result = analyzeWithRegex('test.ts', content, content);

      expect(result.totalLinesChanged).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed code gracefully', () => {
      const before = 'function test(';
      const after = 'function test() {}';

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result).toBeDefined();
    });

    it('should handle very long files', () => {
      const lines = Array(1000).fill('  line;');
      const before = `function test() {\n${lines.join('\n')}}`;
      const after = before.replace('line;', 'line2;');

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result).toBeDefined();
    });

    it('should handle files with mixed line endings', () => {
      const before = 'line1\r\nline2\r\nline3';
      const after = 'line1\nline2\nline3';

      const result = analyzer.analyzeDiff('test.ts', before, after);

      expect(result).toBeDefined();
    });
  });
});
