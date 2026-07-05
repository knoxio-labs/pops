import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RulesFilters } from './RulesFilters';

describe('RulesFilters', () => {
  it('exposes the min-confidence input via an accessible label, not just a placeholder', () => {
    render(
      <RulesFilters
        matchType=""
        minConfidence=""
        onMatchTypeChange={vi.fn()}
        onMinConfidenceChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Min confidence (0-1)')).toBeInTheDocument();
  });

  it('reports a typed min-confidence value to the parent', () => {
    const onMinConfidenceChange = vi.fn();
    render(
      <RulesFilters
        matchType=""
        minConfidence=""
        onMatchTypeChange={vi.fn()}
        onMinConfidenceChange={onMinConfidenceChange}
        onClear={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Min confidence (0-1)'), { target: { value: '0.8' } });

    expect(onMinConfidenceChange).toHaveBeenCalledWith('0.8');
  });

  it('shows the clear-filters button only when a filter is active', () => {
    const { rerender } = render(
      <RulesFilters
        matchType=""
        minConfidence=""
        onMatchTypeChange={vi.fn()}
        onMinConfidenceChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();

    rerender(
      <RulesFilters
        matchType="exact"
        minConfidence=""
        onMatchTypeChange={vi.fn()}
        onMinConfidenceChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });
});
