import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { labelForType } from '../../../lib/transaction-type';
import { HeaderBadges } from './badges';

import type { ProcessedTransaction } from '../../../store/import-store-types';

type MatchType = NonNullable<ProcessedTransaction['entity']>['matchType'];

function makeTx(
  matchType: MatchType,
  overrides: Partial<ProcessedTransaction> = {}
): ProcessedTransaction {
  return {
    date: '2026-04-01',
    description: 'WOOLWORTHS 1234',
    amount: -12.34,
    account: 'Everyday',
    rawRow: '{}',
    checksum: 'abc',
    location: undefined,
    entity: { matchType, confidence: 0.9, entityId: 'ent_1', entityName: 'Woolworths' },
    status: 'matched',
    ...overrides,
  };
}

describe('HeaderBadges — Auto-matched badge', () => {
  // Regression: the badge was dead because `matchType === ('auto-matched' as never)`
  // is always false. These assert the revived semantics: any deterministic
  // automatic match. `ai` is deliberately excluded (CF037/#3655) — it gets its
  // own "AI-matched" badge below, not the same trust signal as a deterministic match.
  it.each<MatchType>(['alias', 'exact', 'prefix', 'contains'])(
    'shows "Auto-matched" for a deterministic automatic match (%s)',
    (matchType) => {
      render(<HeaderBadges transaction={makeTx(matchType)} />);
      expect(screen.getByText('Auto-matched')).toBeInTheDocument();
    }
  );

  it.each<MatchType>(['manual', 'none', 'learned', 'ai'])(
    'does NOT show "Auto-matched" for a non-deterministic match (%s)',
    (matchType) => {
      render(<HeaderBadges transaction={makeTx(matchType)} />);
      expect(screen.queryByText('Auto-matched')).not.toBeInTheDocument();
    }
  );

  it('does not show "Auto-matched" when there is no matched entity', () => {
    render(<HeaderBadges transaction={makeTx('exact', { entity: undefined })} />);
    expect(screen.queryByText('Auto-matched')).not.toBeInTheDocument();
  });

  it('keeps "Rule matched" separate: learned matches show Rule, not Auto', () => {
    render(<HeaderBadges transaction={makeTx('learned')} />);
    expect(screen.getByText('Rule matched')).toBeInTheDocument();
    expect(screen.queryByText('Auto-matched')).not.toBeInTheDocument();
  });
});

describe('HeaderBadges — AI-matched badge (CF037/#3655)', () => {
  it('shows "AI-matched" with a confidence percentage for an ai match', () => {
    render(
      <HeaderBadges
        transaction={makeTx('ai', {
          entity: { matchType: 'ai', confidence: 0.9, entityId: 'ent_1', entityName: 'Woolworths' },
        })}
      />
    );
    expect(screen.getByText(/AI-matched/)).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
    expect(screen.queryByText('Auto-matched')).not.toBeInTheDocument();
  });

  it('flags low-confidence AI matches distinctly', () => {
    render(
      <HeaderBadges
        transaction={makeTx('ai', {
          entity: { matchType: 'ai', confidence: 0.4, entityId: 'ent_1', entityName: 'Woolworths' },
        })}
      />
    );
    const badge = screen.getByText(/AI-matched/);
    expect(badge.closest('[data-slot="badge"]')).toHaveAttribute('data-variant', 'destructive');
    expect(badge.closest('[data-slot="badge"]')).toHaveAttribute(
      'title',
      expect.stringContaining('low confidence')
    );
  });

  it('does not show a percentage when the AI reported no confidence', () => {
    render(
      <HeaderBadges
        transaction={makeTx('ai', {
          entity: { matchType: 'ai', entityId: 'ent_1', entityName: 'Woolworths' },
        })}
      />
    );
    expect(screen.getByText('AI-matched')).toBeInTheDocument();
  });
});

describe('HeaderBadges — Edited badge (store-side manuallyEdited)', () => {
  it('shows "Edited" when manuallyEdited is true', () => {
    render(<HeaderBadges transaction={makeTx('ai', { manuallyEdited: true })} />);
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('does not show "Edited" when manuallyEdited is absent', () => {
    render(<HeaderBadges transaction={makeTx('ai')} />);
    expect(screen.queryByText('Edited')).not.toBeInTheDocument();
  });
});

describe('HeaderBadges — transaction-type badge', () => {
  it('labels a transfer so it is distinguishable from spend', () => {
    render(<HeaderBadges transaction={makeTx('none', { transactionType: 'transfer' })} />);
    const badge = screen.getByText('Transfer').closest('[data-slot="badge"]');
    expect(badge).toHaveAttribute('title', 'Transaction type: Transfer');
    expect(badge?.querySelector('svg')).toBeInTheDocument();
  });

  it('uses the shared display label rather than the raw stored value', () => {
    render(<HeaderBadges transaction={makeTx('exact', { transactionType: 'purchase' })} />);
    expect(screen.getByText('Expense')).toBeInTheDocument();
    expect(screen.queryByText('purchase')).not.toBeInTheDocument();
  });

  it.each(['income', 'refund', 'fee'] as const)('carries no transfer icon for %s', (type) => {
    render(<HeaderBadges transaction={makeTx('exact', { transactionType: type })} />);
    const badge = screen.getByText(labelForType(type)).closest('[data-slot="badge"]');
    expect(badge?.querySelector('svg')).not.toBeInTheDocument();
  });

  it('calls out an untyped row instead of rendering nothing', () => {
    render(<HeaderBadges transaction={makeTx('exact', { transactionType: undefined })} />);
    expect(screen.getByText('Untyped')).toBeInTheDocument();
    expect(screen.queryByText('Transfer')).not.toBeInTheDocument();
  });
});
