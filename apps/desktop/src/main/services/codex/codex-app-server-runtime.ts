import { app } from 'electron';
import path from 'node:path';
import {
  createCodexAppServerManager,
  type CodexAppServerManager,
} from './codex-app-server-manager';

let manager: CodexAppServerManager | undefined;

type InvalidateCatalog = (
  query: { provider: 'openai'; accountId: string },
) => Promise<void>;

const CATALOG_INVALIDATION_NOTIFICATIONS = new Set([
  'account/updated',
  'account/login/completed',
]);

export async function handleCodexNotification(
  accountId: string,
  method: string,
  _params: unknown,
  invalidate: InvalidateCatalog,
): Promise<void> {
  if (!CATALOG_INVALIDATION_NOTIFICATIONS.has(method)) return;
  await invalidate({ provider: 'openai', accountId });
}

export function getCodexAppServerManager(): CodexAppServerManager {
  if (!manager) {
    manager = createCodexAppServerManager({
      clientVersion: app.getVersion(),
      codexHomeRoot: path.join(app.getPath('userData'), 'codex-accounts'),
      onDiagnostic: (message) => console.warn(`[CodexAppServer] ${message}`),
      onNotification: (accountId, method, params) => handleCodexNotification(
        accountId,
        method,
        params,
        async (query) => {
          const { getModelCatalogService } = await import('../model-catalog-runtime');
          await getModelCatalogService().invalidate(query);
        },
      ),
    });
  }
  return manager;
}

export async function shutdownCodexAppServerRuntime(): Promise<void> {
  if (!manager) return;
  const active = manager;
  manager = undefined;
  await active.shutdown();
}
