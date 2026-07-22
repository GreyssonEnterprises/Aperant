import type { TaskStatus } from '../../../shared/types';

/** Verify process ownership before a manual transition leaves in-progress state. */
export async function verifyManualStatusCancellation(
  taskId: string,
  currentStatus: TaskStatus,
  nextStatus: TaskStatus,
  isRunning: boolean,
  killTask: (taskId: string) => Promise<boolean>,
): Promise<boolean> {
  if (currentStatus !== 'in_progress' || nextStatus === 'in_progress' || !isRunning) {
    return true;
  }
  return killTask(taskId);
}
