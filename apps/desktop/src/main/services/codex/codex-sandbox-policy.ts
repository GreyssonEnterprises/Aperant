export interface CodexWorkspaceWritePolicy {
  type: 'workspaceWrite';
  networkAccess: false;
  writableRoots: string[];
  excludeTmpdirEnvVar: true;
  excludeSlashTmp: true;
}

export interface CodexReadOnlyPolicy {
  type: 'readOnly';
  networkAccess: false;
}

export type CodexSandboxPolicy = CodexWorkspaceWritePolicy | CodexReadOnlyPolicy;

export function buildCodexReadOnlyPolicy(): CodexReadOnlyPolicy {
  return { type: 'readOnly', networkAccess: false };
}

export function buildCodexWorkspaceWritePolicy(
  writableRoots: readonly string[],
): CodexWorkspaceWritePolicy {
  return {
    type: 'workspaceWrite',
    networkAccess: false,
    writableRoots: [...writableRoots],
    excludeTmpdirEnvVar: true,
    excludeSlashTmp: true,
  };
}

export function hashCodexWorkspaceWritePolicy(policy: CodexWorkspaceWritePolicy): string {
  return createHash('sha256').update(JSON.stringify(policy)).digest('hex');
}
import { createHash } from 'node:crypto';
