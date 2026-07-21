import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createCodexSessionMetadataStore } from './codex-session-metadata-store';

describe('Codex session metadata store', () => {
  it('preserves task metadata while writing optional per-phase sessions atomically', async () => {
    const specDir = await mkdtemp(path.join(tmpdir(), 'aperant-codex-session-'));
    await writeFile(path.join(specDir, 'task_metadata.json'), JSON.stringify({
      baseBranch: 'develop',
      phaseModels: { coding: 'gpt-5.3-codex' },
    }));
    const store = createCodexSessionMetadataStore();
    const metadata = {
      threadId: 'thread-1', accountId: 'account-1', worktreePath: '/worktree',
      codexVersion: '0.144.6', updatedAt: '2026-07-21T00:00:00.000Z',
    };

    await store.write(specDir, 'coding', metadata);

    expect(await store.read(specDir, 'coding')).toEqual(metadata);
    expect(JSON.parse(await readFile(path.join(specDir, 'task_metadata.json'), 'utf8'))).toEqual({
      baseBranch: 'develop',
      phaseModels: { coding: 'gpt-5.3-codex' },
      codexSessions: { coding: metadata },
    });
  });

  it('ignores malformed or partial persisted session metadata', async () => {
    const specDir = await mkdtemp(path.join(tmpdir(), 'aperant-codex-session-'));
    await writeFile(path.join(specDir, 'task_metadata.json'), JSON.stringify({
      codexSessions: { coding: { threadId: 'thread-1' } },
    }));
    const store = createCodexSessionMetadataStore();
    await expect(store.read(specDir, 'coding')).resolves.toBeUndefined();
  });
});
