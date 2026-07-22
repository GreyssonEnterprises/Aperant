import type { Phase } from '../config/types';
import type { SessionResult } from '../session/types';

interface PhaseLogger {
  startPhase(phase: Phase): void;
  endPhase(phase: Phase, success: boolean): void;
  setSubtask(subtaskId: string | undefined): void;
}

function successful(result: SessionResult | undefined): boolean {
  return result?.outcome === 'completed' || result?.outcome === 'max_steps' ||
    result?.outcome === 'context_window';
}

export async function runCodexWithPhaseLogging(
  execute: () => Promise<SessionResult>,
  logger: PhaseLogger | null,
  phase: Phase,
  subtaskId: string | undefined,
  skipPhaseLogging: boolean,
): Promise<SessionResult> {
  if (logger && !skipPhaseLogging) logger.startPhase(phase);
  if (logger && subtaskId) logger.setSubtask(subtaskId);
  let result: SessionResult | undefined;
  try {
    result = await execute();
    return result;
  } finally {
    if (logger && !skipPhaseLogging) logger.endPhase(phase, successful(result));
    logger?.setSubtask(undefined);
  }
}
