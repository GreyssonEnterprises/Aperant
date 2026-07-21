import { getCodexAppServerManager } from './codex-app-server-runtime';
import { createCodexExecutionBackend } from './codex-execution-backend';
import { createCodexSessionMetadataStore } from './codex-session-metadata-store';

export function createMainCodexExecutionBackend() {
  return createCodexExecutionBackend({
    manager: getCodexAppServerManager(),
    store: createCodexSessionMetadataStore(),
  });
}
