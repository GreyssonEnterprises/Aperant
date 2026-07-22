import { describe, expect, it, vi } from 'vitest';
import { runVerifiedTaskStop } from './task-stop';

describe('TASK_STOP cancellation gate', () => {
  it('waits for verified cancellation before applying USER_STOPPED effects', async () => {
    let finishKill!: (stopped: boolean) => void;
    const killTask = vi.fn(() => new Promise<boolean>((resolve) => { finishKill = resolve; }));
    const handleUserStopped = vi.fn();

    const stop = runVerifiedTaskStop('task-1', killTask, handleUserStopped);
    expect(handleUserStopped).not.toHaveBeenCalled();
    finishKill(true);

    await expect(stop).resolves.toBe(true);
    expect(handleUserStopped).toHaveBeenCalledOnce();
  });

  it('does not apply USER_STOPPED effects when cancellation is retryable or unsafe', async () => {
    const handleUserStopped = vi.fn();

    await expect(runVerifiedTaskStop(
      'task-1',
      vi.fn().mockResolvedValue(false),
      handleUserStopped,
    )).resolves.toBe(false);
    expect(handleUserStopped).not.toHaveBeenCalled();
  });
});
