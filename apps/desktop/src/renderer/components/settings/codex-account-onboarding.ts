import type { ProviderAccount } from '@shared/types/provider-account';
import type { CodexAuthChangedEvent } from '@shared/types/ipc';

export function matchesCodexAuthCompletion(
  event: CodexAuthChangedEvent,
  accountId: string | null,
  loginId: string | null,
): boolean {
  return !!accountId && !!loginId && event.accountId === accountId && event.loginId === loginId;
}

export async function recordAndConsumeCodexCompletion(options: {
  accountId: string;
  loginId: string;
  pending: Map<string, string>;
  consume(accountId: string, loginId: string): Promise<{
    success: boolean;
    data?: CodexAuthChangedEvent;
  }>;
  onCompletion(event: CodexAuthChangedEvent): void | Promise<void>;
}): Promise<void> {
  options.pending.set(options.accountId, options.loginId);
  const result = await options.consume(options.accountId, options.loginId);
  if (!result.success || !result.data || !matchesCodexAuthCompletion(
    result.data,
    options.accountId,
    options.pending.get(options.accountId) ?? null,
  )) return;
  await options.onCompletion(result.data);
}

interface SaveResult {
  success: boolean;
  data?: ProviderAccount;
  error?: string;
}

interface Options {
  retainedAccountId?: string | null;
  editAccountId?: string;
  name: string;
  add(account: Omit<ProviderAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<SaveResult>;
  update(accountId: string, updates: Partial<ProviderAccount>): Promise<SaveResult>;
}

export async function ensureCodexAccountRecord(options: Options): Promise<{
  success: boolean;
  accountId?: string;
  error?: string;
}> {
  if (options.retainedAccountId) {
    return { success: true, accountId: options.retainedAccountId };
  }
  const result = options.editAccountId
    ? await options.update(options.editAccountId, { name: options.name })
    : await options.add({
        provider: 'openai',
        name: options.name,
        authType: 'oauth',
        billingModel: 'subscription',
      });
  if (!result.success || !result.data) {
    return { success: false, ...(result.error ? { error: result.error } : {}) };
  }
  return { success: true, accountId: result.data.id };
}
