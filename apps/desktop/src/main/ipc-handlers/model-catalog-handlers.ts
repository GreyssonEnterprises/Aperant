import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc';
import type { IPCResult, ModelCatalogQuery, ModelCatalogStatus, ModelDescriptor } from '@shared/types';
import type { BuiltinProvider } from '@shared/types/provider-account';
import { getModelCatalogService } from '../services/model-catalog-runtime';

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

export function registerModelCatalogHandlers(service = getModelCatalogService()): void {
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
