/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IdeationEmptyState } from '../IdeationEmptyState';

describe('IdeationEmptyState', () => {
  it('shows the generation error after a failed first run', () => {
    render(
      <IdeationEmptyState
        config={{
          enabledTypes: ['code_improvements'],
          includeRoadmapContext: true,
          includeKanbanContext: true,
          maxIdeasPerType: 5,
        }}
        hasToken={true}
        isCheckingToken={false}
        generationError="Codex subscription authentication is required"
        onGenerate={vi.fn()}
        onOpenConfig={vi.fn()}
        onToggleIdeationType={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Codex subscription authentication is required',
    );
  });
});
