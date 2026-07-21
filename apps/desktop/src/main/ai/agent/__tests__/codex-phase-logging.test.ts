import { describe, expect, it, vi } from 'vitest';

import type { SessionResult } from '../../session/types';
import { runCodexWithPhaseLogging } from '../codex-phase-logging';

const completed: SessionResult = {
  outcome: 'completed',
  stepsExecuted: 1,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  messages: [],
  durationMs: 1,
  toolCallCount: 0,
};

function logger() {
  return {
    startPhase: vi.fn(),
    endPhase: vi.fn(),
    setSubtask: vi.fn(),
  };
}

describe('Codex phase logging', () => {
  it('records phase success and always clears the subtask', async () => {
    const log = logger();
    await expect(runCodexWithPhaseLogging(
      () => Promise.resolve(completed), log, 'coding', 'subtask-1', false,
    )).resolves.toBe(completed);

    expect(log.startPhase).toHaveBeenCalledWith('coding');
    expect(log.setSubtask).toHaveBeenNthCalledWith(1, 'subtask-1');
    expect(log.endPhase).toHaveBeenCalledWith('coding', true);
    expect(log.setSubtask).toHaveBeenLastCalledWith(undefined);
  });

  it('records failure and clears the subtask when execution throws', async () => {
    const log = logger();
    await expect(runCodexWithPhaseLogging(
      () => Promise.reject(new Error('failed')), log, 'qa', 'subtask-1', false,
    )).rejects.toThrow('failed');

    expect(log.endPhase).toHaveBeenCalledWith('qa', false);
    expect(log.setSubtask).toHaveBeenLastCalledWith(undefined);
  });

  it('leaves phase ownership to orchestrators while retaining subtask cleanup', async () => {
    const log = logger();
    await runCodexWithPhaseLogging(
      () => Promise.resolve(completed), log, 'planning', undefined, true,
    );

    expect(log.startPhase).not.toHaveBeenCalled();
    expect(log.endPhase).not.toHaveBeenCalled();
    expect(log.setSubtask).toHaveBeenLastCalledWith(undefined);
  });
});
