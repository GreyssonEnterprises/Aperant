import { CodexRuntimeError } from './services/codex/codex-errors';

export interface AppQuitCoordinatorDependencies {
  shutdownCodex: () => Promise<void>;
  cleanupLegacy: () => Promise<void>;
  quit: () => void;
  reportCodexBlocked: (error: CodexRuntimeError) => void;
  reportCleanupFailure: (error: unknown) => void;
}

export interface AppQuitEvent {
  preventDefault: () => void;
}

export interface AppQuitCoordinator {
  handleBeforeQuit(event: AppQuitEvent): Promise<void>;
}

export function createAppQuitCoordinator(
  dependencies: AppQuitCoordinatorDependencies,
): AppQuitCoordinator {
  let state: 'idle' | 'cleaning' | 'ready' | 'codex-blocked' = 'idle';
  let operation: Promise<void> | undefined;
  let blockedError: CodexRuntimeError | undefined;

  async function runCleanup(): Promise<void> {
    try {
      await dependencies.shutdownCodex();
    } catch (error) {
      blockedError = error instanceof CodexRuntimeError
        ? error
        : new CodexRuntimeError('termination-failed');
      state = 'codex-blocked';
      dependencies.reportCodexBlocked(blockedError);
      return;
    }

    try {
      await dependencies.cleanupLegacy();
    } catch (error) {
      dependencies.reportCleanupFailure(error);
    }
    state = 'ready';
    dependencies.quit();
  }

  return {
    async handleBeforeQuit(event) {
      if (state === 'ready') return;
      event.preventDefault();
      if (state === 'codex-blocked') {
        dependencies.reportCodexBlocked(
          blockedError ?? new CodexRuntimeError('termination-failed'),
        );
        return;
      }
      if (operation) return operation;
      state = 'cleaning';
      operation = runCleanup();
      return operation;
    },
  };
}
