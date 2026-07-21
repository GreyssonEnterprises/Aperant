/** @vitest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelCatalog } from './useModelCatalog';

describe('useModelCatalog Codex fallback gating', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps bundled Codex models unavailable while loading', () => {
    window.electronAPI.listModelCatalog = vi.fn(() => new Promise<never>(() => undefined));

    const { result } = renderHook(() => useModelCatalog({ provider: 'openai' }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.options.find((model) => model.value === 'gpt-5.3-codex')).toMatchObject({
      availability: 'unavailable',
    });
  });

  it('keeps bundled Codex models unavailable after IPC failure', async () => {
    window.electronAPI.listModelCatalog = vi.fn(async () => ({
      success: false,
      error: 'catalog unavailable',
    }));

    const { result } = renderHook(() => useModelCatalog({ provider: 'openai' }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('catalog unavailable');
    expect(result.current.options.find((model) => model.value === 'gpt-5.3-codex')).toMatchObject({
      availability: 'unavailable',
    });
  });
});
