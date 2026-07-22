/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ComponentProps, ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '../../../shared/i18n';
import type { CatalogModelOption } from '../../lib/model-catalog-options';
import { TooltipProvider } from '../ui/tooltip';
import { ThinkingLevelSelect } from './ThinkingLevelSelect';

type ModelAwareProps = ComponentProps<typeof ThinkingLevelSelect> & {
  modelOption: CatalogModelOption & {
    thinking: { mode: 'manual' | 'adaptive'; effortLevels: string[] };
  };
};

const ModelAwareThinkingLevelSelect = ThinkingLevelSelect as ComponentType<ModelAwareProps>;

function modelOption(
  provider: 'openai' | 'anthropic',
  value: string,
  mode: 'manual' | 'adaptive',
): ModelAwareProps['modelOption'] {
  return {
    value,
    label: value,
    provider,
    availability: 'available',
    thinking: {
      mode,
      effortLevels: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    },
  };
}

function renderSelect(props: ModelAwareProps) {
  return render(
    <TooltipProvider>
      <ModelAwareThinkingLevelSelect {...props} />
    </TooltipProvider>,
  );
}

describe('ThinkingLevelSelect model catalog support', () => {
  it('offers the five supported Codex reasoning levels and omits ultra', () => {
    renderSelect({
      value: 'low',
      onChange: vi.fn(),
      modelValue: 'gpt-5.6-sol',
      provider: 'openai',
      modelOption: modelOption('openai', 'gpt-5.6-sol', 'manual'),
    });

    const select = screen.getByRole('combobox');
    expect(select).not.toBeDisabled();
    fireEvent.click(select);
    for (const label of ['Low', 'Medium', 'High', 'Extra High', 'Max']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('option', { name: 'Ultra' })).not.toBeInTheDocument();
  });

  it('offers the same customizable effort range for current Anthropic models', () => {
    renderSelect({
      value: 'medium',
      onChange: vi.fn(),
      modelValue: 'claude-fable-5',
      provider: 'anthropic',
      modelOption: modelOption('anthropic', 'claude-fable-5', 'adaptive'),
    });

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: 'Extra High' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Max' })).toBeInTheDocument();
  });
});
