import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SignedAmount } from './SignedAmount';

function rendered(amount: number) {
  const { container } = render(<SignedAmount amount={amount} />);
  const span = container.querySelector('span');
  if (!span) throw new Error('SignedAmount rendered no span');
  return span;
}

describe('SignedAmount', () => {
  it('shows money out with a minus sign in the destructive colour', () => {
    const span = rendered(-42.5);
    expect(span).toHaveTextContent('-$42.50');
    expect(span).toHaveClass('text-destructive');
  });

  it('shows money in with a plus sign in the success colour', () => {
    const span = rendered(139.72);
    expect(span).toHaveTextContent('+$139.72');
    expect(span).toHaveClass('text-success');
  });

  it('never renders a negative zero from a float residue', () => {
    const span = rendered(0.1 + 0.2 - 0.3 - 1e-10);
    expect(span).toHaveTextContent('+$0.00');
    expect(span).toHaveClass('text-success');
  });

  it('rounds a sub-cent debit to the nearest cent', () => {
    expect(rendered(-0.006)).toHaveTextContent('-$0.01');
  });
});
