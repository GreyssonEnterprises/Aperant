import { describe, expect, it, vi } from 'vitest';
import { CodexRuntimeError } from './services/codex/codex-errors';

interface QuitCoordinator {
  handleBeforeQuit(event: { preventDefault: () => void }): Promise<void>;
}

async function createCoordinator(dependencies: {
  shutdownCodex: () => Promise<void>;
  cleanupLegacy: () => Promise<void>;
  quit: () => void;
  reportCodexBlocked: (error: CodexRuntimeError) => void;
  reportCleanupFailure: (error: unknown) => void;
}): Promise<QuitCoordinator> {
  const module = await import('./app-quit-coordinator');
  return module.createAppQuitCoordinator(dependencies);
}

describe('application quit coordinator', () => {
  it('shuts down Codex first, runs legacy cleanup once, then permits reentrant quit', async () => {
    const order: string[] = [];
    const shutdownCodex = vi.fn(async () => { order.push('codex'); });
    const cleanupLegacy = vi.fn(async () => { order.push('legacy'); });
    const quit = vi.fn(() => { order.push('quit'); });
    const preventDefault = vi.fn();
    const coordinator = await createCoordinator({
      shutdownCodex,
      cleanupLegacy,
      quit,
      reportCodexBlocked: vi.fn(),
      reportCleanupFailure: vi.fn(),
    });

    await coordinator.handleBeforeQuit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(order).toEqual(['codex', 'legacy', 'quit']);
    expect(shutdownCodex).toHaveBeenCalledOnce();
    expect(cleanupLegacy).toHaveBeenCalledOnce();

    preventDefault.mockClear();
    await coordinator.handleBeforeQuit({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(shutdownCodex).toHaveBeenCalledOnce();
    expect(cleanupLegacy).toHaveBeenCalledOnce();
  });

  it('blocks permanently before unrelated cleanup when Codex shutdown fails', async () => {
    const quit = vi.fn();
    const cleanupLegacy = vi.fn(async () => undefined);
    const preventDefault = vi.fn();
    const reportCodexBlocked = vi.fn();
    const reportCleanupFailure = vi.fn();
    const coordinator = await createCoordinator({
      shutdownCodex: async () => {
        throw new CodexRuntimeError('termination-failed');
      },
      cleanupLegacy,
      quit,
      reportCodexBlocked,
      reportCleanupFailure,
    });

    await coordinator.handleBeforeQuit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(cleanupLegacy).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    expect(reportCodexBlocked).toHaveBeenCalledWith(expect.objectContaining({
      code: 'termination-failed',
    }));
    expect(reportCleanupFailure).not.toHaveBeenCalled();

    preventDefault.mockClear();
    await coordinator.handleBeforeQuit({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(cleanupLegacy).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    expect(reportCodexBlocked).toHaveBeenCalledTimes(2);
  });

  it('reports unrelated cleanup failure generically and proceeds with normal quit', async () => {
    const unrelatedError = new Error('terminal persistence failed with private details');
    const quit = vi.fn();
    const reportCodexBlocked = vi.fn();
    const reportCleanupFailure = vi.fn();
    const cleanupLegacy = vi.fn(async () => { throw unrelatedError; });
    const shutdownCodex = vi.fn(async () => undefined);
    const coordinator = await createCoordinator({
      shutdownCodex,
      cleanupLegacy,
      quit,
      reportCodexBlocked,
      reportCleanupFailure,
    });

    await coordinator.handleBeforeQuit({ preventDefault: vi.fn() });

    expect(shutdownCodex).toHaveBeenCalledOnce();
    expect(cleanupLegacy).toHaveBeenCalledOnce();
    expect(reportCleanupFailure).toHaveBeenCalledWith(unrelatedError);
    expect(reportCodexBlocked).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledOnce();

    await coordinator.handleBeforeQuit({ preventDefault: vi.fn() });
    expect(shutdownCodex).toHaveBeenCalledOnce();
    expect(cleanupLegacy).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });
});
