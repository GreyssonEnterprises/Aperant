import type { ProviderAccount } from '@shared/types/provider-account';

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
