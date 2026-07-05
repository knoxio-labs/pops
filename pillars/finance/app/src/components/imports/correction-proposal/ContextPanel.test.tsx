import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContextPanel } from './ContextPanel';

import type { CorrectionSignal } from './types';

const signal: CorrectionSignal = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains',
  entityName: 'Woolworths',
};

function renderPanel(patternConfidence: number | null | undefined) {
  return render(
    <ContextPanel
      signal={signal}
      triggeringTransaction={null}
      rationale={null}
      opCount={1}
      combinedSummary={null}
      patternConfidence={patternConfidence}
    />
  );
}

describe('ContextPanel — low-confidence warning (CF038/#3655)', () => {
  it('shows no warning when confidence is not provided', () => {
    renderPanel(undefined);
    expect(screen.queryByTestId('low-confidence-warning')).not.toBeInTheDocument();
  });

  it('shows no warning when confidence is null (fallback pattern, no AI signal)', () => {
    renderPanel(null);
    expect(screen.queryByTestId('low-confidence-warning')).not.toBeInTheDocument();
  });

  it('shows no warning for a confident AI pattern', () => {
    renderPanel(0.9);
    expect(screen.queryByTestId('low-confidence-warning')).not.toBeInTheDocument();
  });

  it('shows the warning with a rounded percentage for a low-confidence AI pattern', () => {
    renderPanel(0.42);
    const warning = screen.getByTestId('low-confidence-warning');
    expect(warning).toHaveTextContent('42%');
    expect(warning).toHaveTextContent('review this pattern carefully');
  });
});
