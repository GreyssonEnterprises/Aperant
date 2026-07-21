import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CodexSessionMetadata,
  CodexSessionMetadataStore,
} from './codex-execution-backend';

type TaskMetadata = Record<string, unknown> & {
  codexSessions?: Record<string, unknown>;
};

const writes = new Map<string, Promise<void>>();

function isMetadata(value: unknown): value is CodexSessionMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const metadata = value as Record<string, unknown>;
  return ['threadId', 'accountId', 'worktreePath', 'codexVersion', 'updatedAt'].every(
    (key) => typeof metadata[key] === 'string' && (metadata[key] as string).trim().length > 0,
  );
}

async function readTaskMetadata(file: string): Promise<TaskMetadata> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as TaskMetadata
      : {};
  } catch {
    return {};
  }
}

export function createCodexSessionMetadataStore(): CodexSessionMetadataStore {
  return {
    async read(specDir, phase) {
      const metadata = await readTaskMetadata(path.join(specDir, 'task_metadata.json'));
      const session = metadata.codexSessions?.[phase];
      return isMetadata(session) ? { ...session } : undefined;
    },
    async write(specDir, phase, session) {
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
        await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
        await rename(temporary, file);
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
