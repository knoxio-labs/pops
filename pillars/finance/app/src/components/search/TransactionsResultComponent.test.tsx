import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TransactionsResultComponent } from './TransactionsResultComponent';

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    description: 'WOOLWORTHS 1234',
    amount: 42.5,
    date: '2026-03-15',
    entityName: 'Woolworths',
    type: 'purchase',
    ...overrides,
  };
}

describe('TransactionsResultComponent', () => {
  it('renders description and entity name', () => {
    render(<TransactionsResultComponent data={makeData()} />);
    expect(screen.getByText('WOOLWORTHS 1234')).toBeInTheDocument();
    expect(screen.getByText('Woolworths')).toBeInTheDocument();
  });

  it('renders a purchase in red with a minus sign', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'purchase', amount: 99.0 })} />);
    const amount = screen.getByText('-$99.00');
    expect(amount).toBeInTheDocument();
    expect(amount.className).toContain('text-destructive');
  });

  it('renders income in green with a plus sign', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'income', amount: 3500 })} />);
    const amount = screen.getByText('+$3,500.00');
    expect(amount).toBeInTheDocument();
    expect(amount.className).toContain('text-success');
  });

  it('renders a transfer in muted colour with no sign', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'transfer', amount: 200 })} />);
    const amount = screen.getByText('$200.00');
    expect(amount).toBeInTheDocument();
    expect(amount.className).toContain('text-muted-foreground');
  });

  // #3757 nit 2: the 5 new types no longer collapse to the expense fallback —
  // they follow the same tile bucketing as the dashboard.
  it.each([
    ['refund', 'Refund', 'text-destructive', '-'],
    ['reversal', 'Reversal', 'text-destructive', '-'],
    ['loan', 'Loan', 'text-success', '+'],
    ['rebate', 'Rebate', 'text-success', '+'],
    ['tax', 'Tax', 'text-success', '+'],
  ])('renders a %s with the correct label, colour and sign', (type, label, color, sign) => {
    render(<TransactionsResultComponent data={makeData({ type, amount: 100 })} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    const amount = screen.getByText(`${sign}$100.00`);
    expect(amount.className).toContain(color);
  });

  it('renders an unknown type as excluded (muted, no sign, raw label) rather than expense', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'mystery', amount: 100 })} />);
    expect(screen.getByText('mystery')).toBeInTheDocument();
    const amount = screen.getByText('$100.00');
    expect(amount.className).toContain('text-muted-foreground');
  });

  it('renders formatted date', () => {
    render(<TransactionsResultComponent data={makeData({ date: '2026-03-15' })} />);
    expect(screen.getByText(/15 Mar 2026/)).toBeInTheDocument();
  });

  it('hides entity name when null', () => {
    render(<TransactionsResultComponent data={makeData({ entityName: null })} />);
    expect(screen.getByText('WOOLWORTHS 1234')).toBeInTheDocument();
    expect(screen.queryByText('Woolworths')).not.toBeInTheDocument();
  });

  it('shows the title-case type badge for a purchase', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'purchase' })} />);
    expect(screen.getByText('Expense')).toBeInTheDocument();
  });

  it('shows the title-case type badge for income', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'income' })} />);
    expect(screen.getByText('Income')).toBeInTheDocument();
  });

  it('shows the title-case type badge for a transfer', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'transfer' })} />);
    expect(screen.getByText('Transfer')).toBeInTheDocument();
  });

  it('highlights matched portion of description', () => {
    const { container } = render(
      <TransactionsResultComponent
        data={makeData({ description: 'WOOLWORTHS 1234' })}
        query="WOOL"
        matchField="description"
      />
    );
    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('WOOL');
  });

  it('does not highlight when matchField is not description', () => {
    const { container } = render(
      <TransactionsResultComponent
        data={makeData({ description: 'WOOLWORTHS 1234' })}
        query="WOOL"
        matchField="entityName"
      />
    );
    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });

  it('does not highlight when query is empty', () => {
    const { container } = render(
      <TransactionsResultComponent
        data={makeData({ description: 'WOOLWORTHS 1234' })}
        query=""
        matchField="description"
      />
    );
    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });
});
