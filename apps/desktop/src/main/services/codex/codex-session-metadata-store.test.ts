import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createCodexSessionMetadataStore } from './codex-session-metadata-store';

describe('Codex session metadata store', () => {
  it('writes per-phase sessions separately without modifying task metadata', async () => {
    const specDir = await mkdtemp(path.join(tmpdir(), 'aperant-codex-session-'));
    const taskMetadata = `${JSON.stringify({
      baseBranch: 'develop',
      phaseModels: { coding: 'gpt-5.3-codex' },
    }, null, 4)}\n`;
    await writeFile(path.join(specDir, 'task_metadata.json'), taskMetadata);
    const store = createCodexSessionMetadataStore();
    const metadata = {
      schemaVersion: 1 as const,
      threadId: 'thread-1', accountId: 'account-1', worktreePath: '/worktree',
      modelId: 'gpt-5.3-codex',
      codexVersion: '0.144.6', updatedAt: '2026-07-21T00:00:00.000Z',
    };

    await store.write(specDir, 'coding', metadata);

    expect(await store.read(specDir, 'coding')).toEqual(metadata);
    expect(await readFile(path.join(specDir, 'task_metadata.json'), 'utf8')).toBe(taskMetadata);
    expect(JSON.parse(await readFile(path.join(specDir, 'codex_sessions.json'), 'utf8'))).toEqual({
      schemaVersion: 1,
      sessions: { coding: metadata },
    });
  });

  it('rejects malformed persisted session metadata', async () => {
    const specDir = await mkdtemp(path.join(tmpdir(), 'aperant-codex-session-'));
    await writeFile(path.join(specDir, 'codex_sessions.json'), JSON.stringify({
      schemaVersion: 1,
      sessions: { coding: { threadId: 'thread-1' } },
    }));
    const store = createCodexSessionMetadataStore();
    await expect(store.read(specDir, 'coding')).rejects.toThrow('Invalid Codex session metadata');
  });

  it('does not overwrite malformed Codex session metadata', async () => {
    const specDir = await mkdtemp(path.join(tmpdir(), 'aperant-codex-session-'));
    const file = path.join(specDir, 'codex_sessions.json');
    const original = '{"schemaVersion":1,"sessions":"not-an-object"}\n';
    await writeFile(file, original);
    const store = createCodexSessionMetadataStore();

    await expect(store.write(specDir, 'coding', {
      schemaVersion: 1,
      threadId: 'thread-1', accountId: 'account-1', worktreePath: '/worktree',
      modelId: 'gpt-5.3-codex', codexVersion: '0.144.6',
      updatedAt: '2026-07-21T00:00:00.000Z',
    })).rejects.toThrow('Invalid Codex session metadata');
    expect(await readFile(file, 'utf8')).toBe(original);
  });

  it('serializes concurrent per-phase writes without losing either session', async () => {
    const specDir = await mkdtemp(path.join(tmpdir(), 'aperant-codex-session-'));
    const store = createCodexSessionMetadataStore();
    const base = {
      schemaVersion: 1 as const,
      accountId: 'account-1', worktreePath: '/worktree', modelId: 'gpt-5.3-codex',
      codexVersion: '0.144.6', updatedAt: '2026-07-21T00:00:00.000Z',
    };

    await Promise.all([
      store.write(specDir, 'planning', { ...base, threadId: 'thread-plan' }),
      store.write(specDir, 'coding', { ...base, threadId: 'thread-code' }),
    ]);

    await expect(store.read(specDir, 'planning')).resolves.toMatchObject({
      threadId: 'thread-plan', schemaVersion: 1,
    });
    await expect(store.read(specDir, 'coding')).resolves.toMatchObject({
      threadId: 'thread-code', schemaVersion: 1,
    });
  });

  it('leaves concurrent external task metadata edits untouched', async () => {
    const specDir = await mkdtemp(path.join(tmpdir(), 'aperant-codex-session-'));
    const taskFile = path.join(specDir, 'task_metadata.json');
    const externalEdit = '{"status":"externally-updated","revision":42}\n';
    await writeFile(taskFile, '{"status":"initial"}\n');
    const store = createCodexSessionMetadataStore();

    await Promise.all([
      store.write(specDir, 'coding', {
        schemaVersion: 1,
        threadId: 'thread-1', accountId: 'account-1', worktreePath: '/worktree',
        modelId: 'gpt-5.3-codex', codexVersion: '0.144.6',
        updatedAt: '2026-07-21T00:00:00.000Z',
      }),
      writeFile(taskFile, externalEdit),
    ]);

    expect(await readFile(taskFile, 'utf8')).toBe(externalEdit);
  });
});
