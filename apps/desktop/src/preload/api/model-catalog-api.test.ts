import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import { createModelCatalogAPI } from './model-catalog-api';

describe('model catalog preload API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only sends provider and account identifiers across IPC', async () => {
    const api = createModelCatalogAPI();
    const query = { provider: 'anthropic' as const, accountId: 'account-id' };

    await api.listModelCatalog(query);
    await api.refreshModelCatalog(query);
    await api.getModelCatalogStatus();

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.MODEL_CATALOG_LIST, query);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.MODEL_CATALOG_REFRESH, query);
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, IPC_CHANNELS.MODEL_CATALOG_STATUS);
  });
});
