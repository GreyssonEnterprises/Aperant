/**
 * Tests for needsMigration() and migrateProject() in project-initializer.ts
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---- fs mock ----
const mockExistingPaths = new Set<string>();
const mockFiles = new Map<string, string>();

vi.mock('fs', () => {
  const existsSync = vi.fn((p: string) => mockExistingPaths.has(p));

  const renameSync = vi.fn((oldPath: string, newPath: string) => {
    // Simulate rename: remove old, add new
    mockExistingPaths.delete(oldPath);
    mockExistingPaths.add(newPath);
  });

  const readFileSync = vi.fn((filePath: string, _encoding?: string): string => {
    const content = mockFiles.get(filePath);
    if (content === undefined) {
      const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return content;
  });

  const writeFileSync = vi.fn((filePath: string, content: string) => {
    mockFiles.set(filePath, content);
  });

  const appendFileSync = vi.fn((filePath: string, content: string) => {
    const existing = mockFiles.get(filePath) ?? '';
    mockFiles.set(filePath, existing + content);
  });

  const mkdirSync = vi.fn();

  return {
    default: { existsSync, renameSync, readFileSync, writeFileSync, appendFileSync, mkdirSync },
    existsSync,
    renameSync,
    readFileSync,
    writeFileSync,
    appendFileSync,
    mkdirSync,
  };
});

// ---- stub heavy transitive deps ----
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => ''),
}));

vi.mock('../cli-tool-manager', () => ({
  getToolPath: vi.fn(() => 'git'),
}));

// ---- import after mocks ----
import { needsMigration, migrateProject } from '../project-initializer';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT = '/test/project';
const OLD_PATH = path.join(PROJECT, '.auto-claude');
const NEW_PATH = path.join(PROJECT, '.aperant');
const GITIGNORE = path.join(PROJECT, '.gitignore');

beforeEach(() => {
  vi.clearAllMocks();
  mockExistingPaths.clear();
  mockFiles.clear();
});

// ────────────────────────────────────────────────────────────
// needsMigration()
// ────────────────────────────────────────────────────────────

describe('needsMigration', () => {
  test('returns true when .auto-claude exists and .aperant does not', () => {
    mockExistingPaths.add(OLD_PATH);
    expect(needsMigration(PROJECT)).toBe(true);
  });

  test('returns false when .aperant already exists', () => {
    mockExistingPaths.add(OLD_PATH);
    mockExistingPaths.add(NEW_PATH);
    expect(needsMigration(PROJECT)).toBe(false);
  });

  test('returns false when neither exists', () => {
    expect(needsMigration(PROJECT)).toBe(false);
  });

  test('returns false when both exist', () => {
    mockExistingPaths.add(OLD_PATH);
    mockExistingPaths.add(NEW_PATH);
    expect(needsMigration(PROJECT)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// migrateProject()
// ────────────────────────────────────────────────────────────

describe('migrateProject', () => {
  test('successfully renames .auto-claude to .aperant', () => {
    mockExistingPaths.add(OLD_PATH);

    const result = migrateProject(PROJECT);

    expect(result.success).toBe(true);
    expect(fs.renameSync).toHaveBeenCalledWith(OLD_PATH, NEW_PATH);
  });

  test('returns error when .auto-claude does not exist', () => {
    // OLD_PATH not in mockExistingPaths

    const result = migrateProject(PROJECT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No \.auto-claude directory/i);
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  test('returns error when .aperant already exists', () => {
    mockExistingPaths.add(OLD_PATH);
    mockExistingPaths.add(NEW_PATH);

    const result = migrateProject(PROJECT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/\.aperant directory already exists/i);
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  test('updates .gitignore entries during migration', () => {
    mockExistingPaths.add(OLD_PATH);
    mockFiles.set(GITIGNORE, '.auto-claude/\n.auto-claude-security.json\n.auto-claude-status\n');

    const result = migrateProject(PROJECT);

    expect(result.success).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalled();
    // Find the call that wrote to the gitignore
    const gitignoreWrite = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === GITIGNORE
    );
    expect(gitignoreWrite).toBeDefined();
    const writtenContent = gitignoreWrite![1] as string;
    expect(writtenContent).toContain('.aperant/');
    expect(writtenContent).not.toContain('.auto-claude/');
  });

  test('handles .gitignore not existing gracefully', () => {
    mockExistingPaths.add(OLD_PATH);
    // mockFiles has no GITIGNORE entry → readFileSync throws ENOENT

    // Should not throw; the catch block swallows the .gitignore read error,
    // then ensureGitignoreEntries creates the file via writeFileSync
    const result = migrateProject(PROJECT);
    expect(result.success).toBe(true);
    // ensureGitignoreEntries creates a new .gitignore with .aperant/
    const written = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === GITIGNORE
    );
    expect(written).toBeDefined();
    expect(written![1] as string).toContain('.aperant/');
  });
});
