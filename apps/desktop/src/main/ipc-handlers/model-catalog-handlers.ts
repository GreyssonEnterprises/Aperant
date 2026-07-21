import { app, ipcMain } from 'electron';
import path from 'node:path';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import type { IPCResult, ModelCatalogQuery, ModelCatalogStatus, ModelDescriptor } from '@shared/types';
import type { BuiltinProvider, ProviderAccount } from '@shared/types/provider-account';
import { readSettingsFile } from '../settings-utils';
import {
  createModelCatalogService,
  type ModelCatalogService,
} from '../services/model-catalog-service';

const PROVIDERS = new Set<BuiltinProvider>([
  'anthropic', 'openai', 'google', 'amazon-bedrock', 'azure', 'mistral',
  'groq', 'xai', 'openrouter', 'zai', 'ollama', 'openai-compatible',
]);

function parseQuery(value: unknown): ModelCatalogQuery {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object') throw new Error('Invalid model catalog query');
  const input = value as Record<string, unknown>;
  if (input.provider !== undefined &&
      (typeof input.provider !== 'string' || !PROVIDERS.has(input.provider as BuiltinProvider))) {
    throw new Error('Invalid model catalog provider');
  }
  if (input.accountId !== undefined && typeof input.accountId !== 'string') {
    throw new Error('Invalid model catalog account');
  }
  return {
    ...(input.provider ? { provider: input.provider as BuiltinProvider } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
  };
}

function defaultService(): ModelCatalogService {
  return createModelCatalogService({
    cachePath: path.join(app.getPath('userData'), 'model-catalog.json'),
    fetch: globalThis.fetch,
    now: Date.now,
    readAccounts: () => {
      const settings = readSettingsFile();
      return (settings?.providerAccounts as ProviderAccount[] | undefined) ?? [];
    },
  });
}

export function registerModelCatalogHandlers(service = defaultService()): void {
  ipcMain.handle(
    IPC_CHANNELS.MODEL_CATALOG_LIST,
    async (_event, input?: unknown): Promise<IPCResult<{ models: ModelDescriptor[] }>> => {
      try {
        return { success: true, data: { models: await service.list(parseQuery(input)) } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.MODEL_CATALOG_REFRESH,
    async (_event, input?: unknown): Promise<IPCResult<{ models: ModelDescriptor[] }>> => {
      try {
        return { success: true, data: { models: await service.refresh(parseQuery(input)) } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.MODEL_CATALOG_STATUS,
    async (): Promise<IPCResult<ModelCatalogStatus>> => {
      try {
        return { success: true, data: await service.status() };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
}
