import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImportWarningBanner } from './ImportWarningBanner';
import { ReviewWarnings } from './review/ReviewWarnings';

import type { ImportWarning } from '@pops/finance';

function warning(overrides: Partial<ImportWarning> = {}): ImportWarning {
  return {
    type: 'AI_CATEGORIZATION_UNAVAILABLE',
    message: 'AI categorization is disabled on this server',
    ...overrides,
  };
}

describe('ImportWarningBanner', () => {
  it('titles an AI_CATEGORIZATION_UNAVAILABLE warning as disabled-by-configuration', () => {
    render(<ImportWarningBanner warning={warning()} affectedHint="." />);
    expect(screen.getByText('AI Categorization Disabled')).toBeInTheDocument();
    expect(screen.getByText('AI categorization is disabled on this server')).toBeInTheDocument();
  });

  it('titles an AI_API_ERROR warning as an API error', () => {
    render(
      <ImportWarningBanner
        warning={warning({ type: 'AI_API_ERROR', message: 'AI categorization unavailable' })}
        affectedHint="."
      />
    );
    expect(screen.getByText('AI API Error')).toBeInTheDocument();
    expect(screen.getByText('AI categorization unavailable')).toBeInTheDocument();
  });

  it('renders the details line when present', () => {
    render(
      <ImportWarningBanner
        warning={warning({ details: 'FINANCE_AI_CATEGORIZER_ENABLED != true' })}
        affectedHint="."
      />
    );
    expect(screen.getByText('FINANCE_AI_CATEGORIZER_ENABLED != true')).toBeInTheDocument();
  });

  it('omits the affected line when affectedCount is absent', () => {
    render(<ImportWarningBanner warning={warning()} affectedHint="." />);
    expect(screen.queryByText(/could not be automatically categorized/)).not.toBeInTheDocument();
  });

  it('pluralizes the affected copy and appends the hint tail', () => {
    render(
      <ImportWarningBanner
        warning={warning({ affectedCount: 3 })}
        affectedHint=". You can manually categorize them in the review step."
      />
    );
    expect(
      screen.getByText(
        '3 transactions could not be automatically categorized. You can manually categorize them in the review step.'
      )
    ).toBeInTheDocument();
  });

  it('uses the singular form for one affected transaction', () => {
    render(
      <ImportWarningBanner
        warning={warning({ affectedCount: 1 })}
        affectedHint=" and may appear in the Uncertain or Failed tabs."
      />
    );
    expect(
      screen.getByText(
        '1 transaction could not be automatically categorized and may appear in the Uncertain or Failed tabs.'
      )
    ).toBeInTheDocument();
  });
});

describe('ReviewWarnings', () => {
  it('renders nothing when warnings is undefined', () => {
    const { container } = render(<ReviewWarnings />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when warnings is empty', () => {
    const { container } = render(<ReviewWarnings warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one banner per warning with the review hint copy', () => {
    render(
      <ReviewWarnings
        warnings={[
          warning({ affectedCount: 2 }),
          warning({ type: 'AI_API_ERROR', message: 'AI categorization unavailable' }),
        ]}
      />
    );
    expect(screen.getByText('AI Categorization Disabled')).toBeInTheDocument();
    expect(screen.getByText('AI API Error')).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 transactions could not be automatically categorized and may appear in the Uncertain or Failed tabs.'
      )
    ).toBeInTheDocument();
  });
});
