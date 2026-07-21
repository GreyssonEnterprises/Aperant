import { describe, expect, it, vi } from 'vitest';
import { CodexRuntimeError } from './services/codex/codex-errors';

interface QuitCoordinator {
  handleBeforeQuit(event: { preventDefault: () => void }): Promise<void>;
}

async function createCoordinator(dependencies: {
  cleanup: () => Promise<void>;
  quit: () => void;
  reportBlocked: (error: CodexRuntimeError) => void;
}): Promise<QuitCoordinator> {
  const module = await import('./app-quit-coordinator');
  return module.createAppQuitCoordinator(dependencies);
}

describe('application quit coordinator', () => {
  it('prevents the first quit, completes cleanup, then permits reentrant quit', async () => {
    const cleanup = vi.fn(async () => undefined);
    const quit = vi.fn();
    const preventDefault = vi.fn();
    const coordinator = await createCoordinator({ cleanup, quit, reportBlocked: vi.fn() });

    await coordinator.handleBeforeQuit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();

    preventDefault.mockClear();
    await coordinator.handleBeforeQuit({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('keeps Electron alive and reports a typed error when Codex cleanup fails', async () => {
    const quit = vi.fn();
    const preventDefault = vi.fn();
    const reportBlocked = vi.fn();
    const coordinator = await createCoordinator({
      cleanup: async () => {
        throw new CodexRuntimeError('termination-failed');
      },
      quit,
      reportBlocked,
    });

    await coordinator.handleBeforeQuit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    expect(reportBlocked).toHaveBeenCalledWith(expect.objectContaining({
      code: 'termination-failed',
    }));

    preventDefault.mockClear();
    await coordinator.handleBeforeQuit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    expect(reportBlocked).toHaveBeenCalledTimes(2);
  });
});
