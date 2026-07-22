import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import type { ProviderAccount } from '@shared/types/provider-account';
import { createModelCatalogService } from './model-catalog-service';

type IpcHandler = (event: unknown, input?: unknown) => Promise<unknown>;
const handlers = vi.hoisted(() => new Map<string, IpcHandler>());

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
  },
}));

import { registerModelCatalogHandlers } from '../ipc-handlers/model-catalog-handlers';
import { CodexRuntimeError } from './codex/codex-errors';

const account: ProviderAccount = {
  id: 'codex-account',
  provider: 'openai',
  name: 'Codex',
  authType: 'oauth',
  billingModel: 'subscription',
  createdAt: 1,
  updatedAt: 1,
};

describe('model catalog status IPC redaction', () => {
  beforeEach(() => handlers.clear());

  it('never returns raw RPC secret text through status IPC', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aperant-status-redaction-'));
    const service = createModelCatalogService({
      cachePath: join(directory, 'catalog.json'),
      fetch: vi.fn(),
      now: () => 10_000,
      readAccounts: () => [account],
      discoverCodexModels: async () => {
        throw new CodexRuntimeError(
          'rpc-error',
          'RPC failed: Authorization Bearer renderer-secret',
        );
      },
    });
    await service.refresh({ provider: 'openai', accountId: account.id });
    registerModelCatalogHandlers(service);

    const response = await handlers.get(IPC_CHANNELS.MODEL_CATALOG_STATUS)?.({});
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain('renderer-secret');
    expect(response).toMatchObject({
      success: true,
      data: {
        snapshots: [expect.objectContaining({
          lastErrorCode: 'rpc-error',
          lastError: 'Codex app-server request failed',
        })],
      },
    });
  });
});
