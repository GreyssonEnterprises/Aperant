import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CodexSessionMetadata,
  CodexSessionMetadataStore,
} from './codex-execution-backend';

type TaskMetadata = Record<string, unknown> & {
  codexSessions?: Record<string, unknown>;
};

const writes = new Map<string, Promise<void>>();
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PHASE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

function invalidMetadata(): Error {
  return new Error('Invalid Codex session metadata');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMetadata(value: unknown): value is CodexSessionMetadata {
  if (!isRecord(value)) return false;
  const metadata = value as Record<string, unknown>;
  if (metadata.schemaVersion !== 1 || Object.keys(metadata).some((key) => FORBIDDEN_KEYS.has(key))) {
    return false;
  }
  return ['threadId', 'accountId', 'worktreePath', 'codexVersion', 'updatedAt'].every(
    (key) => typeof metadata[key] === 'string' && (metadata[key] as string).trim().length > 0,
  ) && typeof metadata.modelId === 'string' && metadata.modelId.trim().length > 0;
}

async function readTaskMetadata(file: string): Promise<TaskMetadata> {
  let contents: string;
  try {
    contents = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw invalidMetadata();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw invalidMetadata();
  }
  if (!isRecord(parsed) || Object.keys(parsed).some((key) => FORBIDDEN_KEYS.has(key))) {
    throw invalidMetadata();
  }
  if (parsed.codexSessions !== undefined) {
    if (!isRecord(parsed.codexSessions) ||
      Object.keys(parsed.codexSessions).some((key) => FORBIDDEN_KEYS.has(key)) ||
      Object.values(parsed.codexSessions).some((session) => !isMetadata(session))) {
      throw invalidMetadata();
    }
  }
  return parsed as TaskMetadata;
}

export function createCodexSessionMetadataStore(): CodexSessionMetadataStore {
  return {
    async read(specDir, phase) {
      if (!PHASE_PATTERN.test(phase)) throw invalidMetadata();
      const metadata = await readTaskMetadata(path.join(specDir, 'task_metadata.json'));
      const session = metadata.codexSessions?.[phase];
      return session === undefined ? undefined : { ...session } as CodexSessionMetadata;
    },
    async write(specDir, phase, session) {
      if (!PHASE_PATTERN.test(phase) || !isMetadata(session)) throw invalidMetadata();
      const file = path.join(specDir, 'task_metadata.json');
      const previous = writes.get(file) ?? Promise.resolve();
      const operation = previous.catch(() => undefined).then(async () => {
        await mkdir(specDir, { recursive: true });
        const metadata = await readTaskMetadata(file);
        metadata.codexSessions = {
          ...(metadata.codexSessions ?? {}),
          [phase]: session,
        };
        const temporary = path.join(specDir, `.task_metadata.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, {
            encoding: 'utf8',
            mode: 0o600,
          });
          await rename(temporary, file);
        } catch (error) {
          await unlink(temporary).catch(() => undefined);
          throw error;
        }
      });
      writes.set(file, operation);
      try {
        await operation;
      } finally {
        if (writes.get(file) === operation) writes.delete(file);
      }
    },
  };
}
