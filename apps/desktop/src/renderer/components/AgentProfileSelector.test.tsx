/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../shared/i18n';
import { useActiveProvider } from '../hooks/useActiveProvider';
import { useModelCatalog } from '../hooks/useModelCatalog';
import { AgentProfileSelector } from './AgentProfileSelector';

vi.mock('../hooks/useActiveProvider', () => ({ useActiveProvider: vi.fn() }));
vi.mock('../hooks/useModelCatalog', () => ({ useModelCatalog: vi.fn() }));

describe('AgentProfileSelector Ollama models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useActiveProvider).mockReturnValue({ provider: 'ollama' } as never);
    vi.mocked(useModelCatalog).mockReturnValue({
      models: [],
      options: [],
      isLoading: false,
      error: undefined,
    });
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
  });

  it('keeps a saved unavailable Ollama model beside installed models', async () => {
    render(
      <AgentProfileSelector
        profileId="auto"
        model="removed:latest"
        thinkingLevel="medium"
        phaseModels={{
          spec: 'removed:latest',
          planning: 'removed:latest',
          coding: 'removed:latest',
          qa: 'removed:latest',
        }}
        onProfileChange={vi.fn()}
        onModelChange={vi.fn()}
        onThinkingLevelChange={vi.fn()}
        onPhaseModelsChange={vi.fn()}
        onPhaseThinkingChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(window.electronAPI.listOllamaModels).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /phase configuration/i }));
    const modelSelects = screen.getAllByRole('combobox');
    fireEvent.click(modelSelects[1]);

    expect(await screen.findByText('llama:latest')).toBeInTheDocument();
    expect(screen.getAllByText(/removed:latest/).length).toBeGreaterThan(0);
  });
});
