import { CodexRuntimeError } from './services/codex/codex-errors';

export interface AppQuitCoordinatorDependencies {
  cleanup: () => Promise<void>;
  quit: () => void;
  reportBlocked: (error: CodexRuntimeError) => void;
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
  let state: 'idle' | 'cleaning' | 'ready' | 'blocked' = 'idle';
  let cleanup: Promise<void> | undefined;
  let blockedError: CodexRuntimeError | undefined;

  return {
    async handleBeforeQuit(event) {
      if (state === 'ready') return;
      event.preventDefault();
      if (state === 'blocked') {
        dependencies.reportBlocked(blockedError ?? new CodexRuntimeError('termination-failed'));
        return;
      }
      if (cleanup) return cleanup;
      state = 'cleaning';
      cleanup = dependencies.cleanup().then(
        () => {
          state = 'ready';
          dependencies.quit();
        },
        (error: unknown) => {
          blockedError = error instanceof CodexRuntimeError
            ? error
            : new CodexRuntimeError('termination-failed');
          state = 'blocked';
          dependencies.reportBlocked(blockedError);
        },
      );
      return cleanup;
    },
  };
}
