import { app } from 'electron';
import path from 'node:path';
import {
  createCodexAppServerManager,
  type CodexAppServerManager,
} from './codex-app-server-manager';
import { CodexRuntimeError } from './codex-errors';

let manager: CodexAppServerManager | undefined;
let state: 'open' | 'shutting-down' | 'closed' = 'open';
let shutdownPromise: Promise<void> | undefined;
const accountNotificationListeners = new Set<(
  accountId: string,
  method: string,
) => void>();

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
  for (const listener of accountNotificationListeners) listener(accountId, method);
  if (!CATALOG_INVALIDATION_NOTIFICATIONS.has(method)) return;
  await invalidate({ provider: 'openai', accountId });
}

export function subscribeCodexAccountNotifications(
  listener: (accountId: string, method: string) => void,
): () => void {
  accountNotificationListeners.add(listener);
  return () => accountNotificationListeners.delete(listener);
}

export function getCodexAppServerManager(): CodexAppServerManager {
  if (state !== 'open') throw new CodexRuntimeError('shutdown');
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
  if (shutdownPromise) return shutdownPromise;
  state = 'shutting-down';
  const active = manager;
  shutdownPromise = (async () => {
    try {
      await active?.shutdown();
    } finally {
      manager = undefined;
      state = 'closed';
    }
  })();
  return shutdownPromise;
}

export function resetCodexAppServerRuntimeForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Codex runtime reset is only available in tests');
  }
  manager = undefined;
  state = 'open';
  shutdownPromise = undefined;
  accountNotificationListeners.clear();
}
