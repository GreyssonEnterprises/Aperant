/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../shared/i18n';
import { useSettingsStore } from '../../stores/settings-store';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { MultiProviderModelSelect } from './MultiProviderModelSelect';

vi.mock('../../stores/settings-store', () => ({ useSettingsStore: vi.fn() }));
vi.mock('../../hooks/useModelCatalog', () => ({ useModelCatalog: vi.fn() }));

describe('MultiProviderModelSelect saved values', () => {
  let settingsState: { settings: { providerAccounts: Array<{ provider: string }> } };

  beforeEach(() => {
    vi.clearAllMocks();
    settingsState = { settings: { providerAccounts: [] } };
    vi.mocked(useSettingsStore).mockImplementation((selector) => selector(settingsState as never));
    vi.mocked(useModelCatalog).mockReturnValue({
      models: [],
      options: [],
      isLoading: false,
      error: undefined,
    });
  });

  it('groups an uncatalogued saved value under its explicit provider', () => {
    render(
      <MultiProviderModelSelect
        value="private-model"
        valueProvider="groq"
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'private-model' }));

    expect(screen.getByText('Groq')).toBeInTheDocument();
    expect(screen.getAllByText('private-model')).toHaveLength(2);
  });

  it('keeps a saved unavailable Ollama value beside installed models', async () => {
    settingsState.settings.providerAccounts = [{ provider: 'ollama' }];
    window.electronAPI.listOllamaModels = vi.fn(async () => ({
      success: true,
      data: {
        models: [{
          name: 'llama:latest',
          size_bytes: 1_000_000,
          size_gb: 0.001,
          modified_at: '2026-01-01T00:00:00.000Z',
          is_embedding: false,
        }],
        count: 1,
      },
    }));

    render(
      <MultiProviderModelSelect
        value="removed:latest"
        valueProvider="ollama"
        filterProvider="ollama"
        onChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(window.electronAPI.listOllamaModels).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'removed:latest' }));

    expect(await screen.findByText('llama:latest')).toBeInTheDocument();
    expect(screen.getAllByText('removed:latest')).toHaveLength(2);
  });
});
