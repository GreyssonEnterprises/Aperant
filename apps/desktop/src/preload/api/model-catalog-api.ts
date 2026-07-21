import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import type {
  IPCResult,
  ModelCatalogQuery,
  ModelCatalogStatus,
  ModelDescriptor,
} from '@shared/types';

export interface ModelCatalogAPI {
  listModelCatalog: (
    query?: ModelCatalogQuery,
  ) => Promise<IPCResult<{ models: ModelDescriptor[] }>>;
  refreshModelCatalog: (
    query?: ModelCatalogQuery,
  ) => Promise<IPCResult<{ models: ModelDescriptor[] }>>;
  getModelCatalogStatus: () => Promise<IPCResult<ModelCatalogStatus>>;
}

export const createModelCatalogAPI = (): ModelCatalogAPI => ({
  listModelCatalog: (query = {}) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_CATALOG_LIST, query),
  refreshModelCatalog: (query = {}) =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_CATALOG_REFRESH, query),
  getModelCatalogStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MODEL_CATALOG_STATUS),
});
