import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelCatalogService } from '../services/model-catalog-service';
import type { ProviderAccount } from '@shared/types/provider-account';

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>;
const { handlers, settingsState, retireCodexAccount } = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  settingsState: { current: {} as Record<string, unknown> },
  retireCodexAccount: vi.fn(async () => undefined),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)) },
  app: { getPath: vi.fn(() => '/tmp'), getAppPath: vi.fn(() => '/tmp') },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn() },
  session: { defaultSession: { availableSpellCheckerLanguages: [], setSpellCheckerLanguages: vi.fn() } },
}));
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }));
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock('../settings-utils', () => ({
  getSettingsPath: vi.fn(() => '/tmp/settings.json'),
  readSettingsFile: vi.fn(() => settingsState.current),
}));
vi.mock('../cli-tool-manager', () => ({
  configureTools: vi.fn(),
  getToolPath: vi.fn(),
  getToolInfo: vi.fn(),
  isPathFromWrongPlatform: vi.fn(() => false),
  preWarmToolCache: vi.fn(),
}));
vi.mock('../app-updater', () => ({
  setUpdateChannel: vi.fn(),
  setUpdateChannelWithDowngradeCheck: vi.fn(),
}));
vi.mock('../agent', () => ({ AgentManager: vi.fn() }));

import { IPC_CHANNELS } from '@shared/constants/ipc';
import { registerSettingsHandlers } from './settings-handlers';

function account(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: 'account-id',
    provider: 'anthropic',
    name: 'Anthropic',
    authType: 'api-key',
    billingModel: 'pay-per-use',
    apiKey: 'old-key',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('provider account catalog invalidation', () => {
  const catalog: ModelCatalogService = {
    list: vi.fn(async () => []),
    refresh: vi.fn(async () => []),
    invalidate: vi.fn(async () => undefined),
    status: vi.fn(async () => ({ snapshots: [] })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    settingsState.current = {};
    registerSettingsHandlers({} as never, () => null, catalog, retireCodexAccount);
  });

  it('invalidates the provider when an account is created', async () => {
    const handler = handlers.get(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE);
    await handler?.({}, {
      provider: 'anthropic',
      name: 'New',
      authType: 'api-key',
      billingModel: 'pay-per-use',
      apiKey: 'new-key',
    });

    expect(catalog.invalidate).toHaveBeenCalledWith({ provider: 'anthropic' });
  });

  it('invalidates the account when authentication is updated', async () => {
    settingsState.current = { providerAccounts: [account()] };
    const handler = handlers.get(IPC_CHANNELS.PROVIDER_ACCOUNTS_UPDATE);
    await handler?.({}, 'account-id', { apiKey: 'replacement-key' });

    expect(catalog.invalidate).toHaveBeenCalledWith({
      provider: 'anthropic',
      accountId: 'account-id',
    });
  });

  it('invalidates the removed account snapshot', async () => {
    settingsState.current = { providerAccounts: [account()] };
    const handler = handlers.get(IPC_CHANNELS.PROVIDER_ACCOUNTS_DELETE);
    await handler?.({}, 'account-id');

    expect(catalog.invalidate).toHaveBeenCalledWith({
      provider: 'anthropic',
      accountId: 'account-id',
    });
  });

  it('retires an OpenAI subscription process before deleting its account record', async () => {
    settingsState.current = { providerAccounts: [account({
      provider: 'openai', authType: 'oauth', billingModel: 'subscription', apiKey: undefined,
    })] };
    const handler = handlers.get(IPC_CHANNELS.PROVIDER_ACCOUNTS_DELETE);
    await handler?.({}, 'account-id');

    expect(retireCodexAccount).toHaveBeenCalledWith('account-id');
    expect(catalog.invalidate).toHaveBeenCalledWith({ provider: 'openai', accountId: 'account-id' });
  });

  it('retains the account when Codex retirement cannot be verified', async () => {
    settingsState.current = { providerAccounts: [account({
      provider: 'openai', authType: 'oauth', billingModel: 'subscription', apiKey: undefined,
    })] };
    retireCodexAccount.mockRejectedValueOnce(new Error('private process details'));
    const handler = handlers.get(IPC_CHANNELS.PROVIDER_ACCOUNTS_DELETE);
    await expect(handler?.({}, 'account-id')).resolves.toEqual({
      success: false,
      error: 'Codex account process could not be stopped safely',
    });
    expect(catalog.invalidate).not.toHaveBeenCalled();
  });
});
