import { getCodexAppServerManager } from './codex-app-server-runtime';
import { createCodexExecutionBackend } from './codex-execution-backend';
import { createCodexSessionMetadataStore } from './codex-session-metadata-store';
import { createCodexSandboxProbe } from './codex-sandbox-probe';

let sharedSandboxProbe: ReturnType<typeof createCodexSandboxProbe> | undefined;

export function createMainCodexExecutionBackend() {
  const manager = getCodexAppServerManager();
  sharedSandboxProbe ??= createCodexSandboxProbe({
    getRuntimeVersion: (accountId) => manager.getSandboxRuntimeVersion(accountId),
    execute: (accountId, request) => manager.executeSandboxCommand(accountId, request),
  });
  return createCodexExecutionBackend({
    manager,
    store: createCodexSessionMetadataStore(),
    sandboxProbe: sharedSandboxProbe,
  });
}
