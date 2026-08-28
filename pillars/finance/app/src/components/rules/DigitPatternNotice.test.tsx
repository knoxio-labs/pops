import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DigitPatternNotice } from './DigitPatternNotice';

describe('DigitPatternNotice', () => {
  it('warns for a regex pattern whose match depends on digits', () => {
    render(<DigitPatternNotice pattern="\d{4}-\d{2}" matchType="regex" />);
    expect(screen.getByTestId('digit-pattern-notice')).toHaveTextContent(
      /digits are removed from descriptions before matching/i
    );
  });

  it('warns for a literal account number', () => {
    render(<DigitPatternNotice pattern="CARD 4471" matchType="regex" />);
    expect(screen.getByTestId('digit-pattern-notice')).toBeInTheDocument();
  });

  it('stays silent for a digit-free regex', () => {
    render(<DigitPatternNotice pattern="^WOOLWORTHS" matchType="regex" />);
    expect(screen.queryByTestId('digit-pattern-notice')).not.toBeInTheDocument();
  });

  it('stays silent for a quantifier, which needs no digit in the description', () => {
    render(<DigitPatternNotice pattern="A{2,3}" matchType="regex" />);
    expect(screen.queryByTestId('digit-pattern-notice')).not.toBeInTheDocument();
  });

  it('stays silent for exact/contains, whose digits are stripped on both sides', () => {
    const { rerender } = render(
      <DigitPatternNotice pattern="WOOLWORTHS 1234" matchType="contains" />
    );
    expect(screen.queryByTestId('digit-pattern-notice')).not.toBeInTheDocument();
    rerender(<DigitPatternNotice pattern="WOOLWORTHS 1234" matchType="exact" />);
    expect(screen.queryByTestId('digit-pattern-notice')).not.toBeInTheDocument();
  });
});
