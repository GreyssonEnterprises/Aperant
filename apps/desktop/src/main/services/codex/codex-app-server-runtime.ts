import { app } from 'electron';
import path from 'node:path';
import {
  createCodexAppServerManager,
  type CodexAppServerManager,
} from './codex-app-server-manager';

let manager: CodexAppServerManager | undefined;

export function getCodexAppServerManager(): CodexAppServerManager {
  if (!manager) {
    manager = createCodexAppServerManager({
      codexHomeRoot: path.join(app.getPath('userData'), 'codex-accounts'),
      onDiagnostic: (message) => console.warn(`[CodexAppServer] ${message}`),
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
