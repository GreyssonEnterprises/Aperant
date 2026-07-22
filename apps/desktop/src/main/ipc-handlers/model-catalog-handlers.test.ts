import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import type { ModelCatalogService } from '../services/model-catalog-service';
import { registerModelCatalogHandlers } from './model-catalog-handlers';

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  ipcMain: { handle: vi.fn() },
}));

describe('model catalog IPC', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const service: ModelCatalogService = {
    list: vi.fn(async () => []),
    refresh: vi.fn(async () => []),
    invalidate: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ snapshots: [] })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as (...args: unknown[]) => unknown);
    });
    registerModelCatalogHandlers(service);
  });

  it('registers list, refresh, and status without accepting credentials', async () => {
    const query = { provider: 'anthropic' as const, accountId: 'account-id' };

    await handlers.get(IPC_CHANNELS.MODEL_CATALOG_LIST)?.({}, query);
    await handlers.get(IPC_CHANNELS.MODEL_CATALOG_REFRESH)?.({}, query);
    await handlers.get(IPC_CHANNELS.MODEL_CATALOG_STATUS)?.({});

    expect(service.list).toHaveBeenCalledWith(query);
    expect(service.refresh).toHaveBeenCalledWith(query);
    expect(service.status).toHaveBeenCalledWith();
    expect(Object.keys(query)).toEqual(['provider', 'accountId']);
  });
});
