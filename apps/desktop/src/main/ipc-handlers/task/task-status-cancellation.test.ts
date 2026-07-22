import { describe, expect, it, vi } from 'vitest';
import { verifyManualStatusCancellation } from './task-status-cancellation';

describe('manual task status cancellation gate', () => {
  it('does not allow status or plan mutation before cancellation is verified', async () => {
    let finishKill!: (stopped: boolean) => void;
    const killTask = vi.fn(() => new Promise<boolean>((resolve) => { finishKill = resolve; }));
    const task = { status: 'in_progress' };
    const plan = { status: 'in_progress' };
    const update = async () => {
      const verified = await verifyManualStatusCancellation(
        'task-1', 'in_progress', 'backlog', true, killTask,
      );
      if (!verified) return false;
      task.status = 'backlog';
      plan.status = 'backlog';
      return true;
    };

    const pending = update();
    expect(task.status).toBe('in_progress');
    expect(plan.status).toBe('in_progress');
    finishKill(true);

    await expect(pending).resolves.toBe(true);
    expect(task.status).toBe('backlog');
    expect(plan.status).toBe('backlog');
  });

  it('leaves the original status and plan untouched after an unsafe stop', async () => {
    const task = { status: 'in_progress' };
    const plan = { status: 'in_progress' };
    const verified = await verifyManualStatusCancellation(
      'task-1', 'in_progress', 'backlog', true, vi.fn().mockResolvedValue(false),
    );
    if (verified) {
      task.status = 'backlog';
      plan.status = 'backlog';
    }

    expect(verified).toBe(false);
    expect(task.status).toBe('in_progress');
    expect(plan.status).toBe('in_progress');
  });
});
