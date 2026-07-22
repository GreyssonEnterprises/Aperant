/**
 * Apply TASK_STOP side effects only after the execution owner confirms that
 * cooperative cancellation finished safely.
 */
export async function runVerifiedTaskStop(
  taskId: string,
  killTask: (taskId: string) => Promise<boolean>,
  onVerifiedStop: () => void | Promise<void>,
): Promise<boolean> {
  const stopped = await killTask(taskId);
  if (!stopped) return false;
  await onVerifiedStop();
  return true;
}
