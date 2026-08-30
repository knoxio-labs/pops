import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TransactionCard } from './TransactionCard';

import type { ProcessedTransaction } from '@pops/finance';

function makeTx(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-04-01',
    description: 'WOOLWORTHS 1234',
    amount: -12.34,
    account: 'Everyday',
    rawRow: '{}',
    checksum: 'abc',
    location: undefined,
    entity: { matchType: 'learned', confidence: 0.92, entityId: 'ent_1', entityName: 'Woolworths' },
    status: 'matched',
    ruleProvenance: {
      source: 'correction',
      ruleId: 'corr_123',
      pattern: 'WOOLWORTHS',
      matchType: 'contains',
      confidence: 0.92,
    },
    ...overrides,
  };
}

describe('TransactionCard rule provenance', () => {
  it('renders the Rule matched badge and details when ruleProvenance is present', () => {
    render(<TransactionCard transaction={makeTx()} readonly={true} variant="matched" />);

    expect(screen.getByText('Rule matched')).toBeInTheDocument();
    expect(screen.getByText(/contains/i)).toBeInTheDocument();
    expect(screen.getByText(/92%/i)).toBeInTheDocument();
    expect(screen.getByText('WOOLWORTHS')).toBeInTheDocument();
  });

  it('renders provenance for uncertain transactions too', () => {
    render(
      <TransactionCard
        transaction={makeTx({ status: 'uncertain' })}
        readonly={true}
        variant="uncertain"
      />
    );

    expect(screen.getByText('Rule matched')).toBeInTheDocument();
    expect(screen.getByText('WOOLWORTHS')).toBeInTheDocument();
  });

  it('does not render the badge when not rule matched', () => {
    render(
      <TransactionCard
        transaction={makeTx({
          ruleProvenance: undefined,
          entity: { matchType: 'exact', entityId: 'ent_1', entityName: 'Woolworths' },
        })}
        readonly={true}
        variant="matched"
      />
    );

    expect(screen.queryByText('Rule matched')).toBeNull();
  });
});

describe('TransactionCard override indicators (US-07)', () => {
  it('does not show override indicator when only one rule matched', () => {
    render(
      <TransactionCard
        transaction={makeTx({
          matchedRules: [
            {
              ruleId: 'corr_123',
              pattern: 'WOOLWORTHS',
              matchType: 'contains',
              confidence: 0.92,
              priority: 0,
              entityId: 'ent_1',
              entityName: 'Woolworths',
            },
          ],
        })}
        readonly={true}
        variant="matched"
      />
    );

    expect(screen.queryByText(/overridden/)).toBeNull();
  });

  it('shows "+1 overridden" badge when two rules matched', () => {
    render(
      <TransactionCard
        transaction={makeTx({
          matchedRules: [
            {
              ruleId: 'corr_123',
              pattern: 'WOOLWORTHS',
              matchType: 'contains',
              confidence: 0.92,
              priority: 0,
              entityId: 'ent_1',
              entityName: 'Woolworths',
            },
            {
              ruleId: 'corr_456',
              pattern: 'WOOL',
              matchType: 'contains',
              confidence: 0.8,
              priority: 10,
              entityId: 'ent_1',
              entityName: 'Woolworths',
            },
          ],
        })}
        readonly={true}
        variant="matched"
      />
    );

    expect(screen.getByText('+1 overridden')).toBeInTheDocument();
  });

  it('shows "+2 overridden" badge when three rules matched', () => {
    render(
      <TransactionCard
        transaction={makeTx({
          matchedRules: [
            {
              ruleId: 'corr_1',
              pattern: 'WOOLWORTHS',
              matchType: 'exact',
              confidence: 0.95,
              priority: 0,
              entityId: 'ent_1',
              entityName: 'Woolworths',
            },
            {
              ruleId: 'corr_2',
              pattern: 'WOOLWORTHS',
              matchType: 'contains',
              confidence: 0.9,
              priority: 5,
              entityId: 'ent_1',
              entityName: 'Woolworths',
            },
            {
              ruleId: 'corr_3',
              pattern: 'WOOL',
              matchType: 'contains',
              confidence: 0.8,
              priority: 10,
              entityId: 'ent_1',
              entityName: 'Woolworths',
            },
          ],
        })}
        readonly={true}
        variant="matched"
      />
    );

    expect(screen.getByText('+2 overridden')).toBeInTheDocument();
  });

  it('reveals overridden rules in popover on click', async () => {
    render(
      <TransactionCard
        transaction={makeTx({
          matchedRules: [
            {
              ruleId: 'corr_123',
              pattern: 'WOOLWORTHS',
              matchType: 'contains',
              confidence: 0.92,
              priority: 0,
              entityId: 'ent_1',
              entityName: 'Woolworths',
            },
            {
              ruleId: 'corr_456',
              pattern: 'WOOL',
              matchType: 'contains',
              confidence: 0.8,
              priority: 10,
              entityId: 'ent_2',
              entityName: 'Wool Store',
            },
          ],
        })}
        readonly={true}
        variant="matched"
      />
    );

    fireEvent.click(screen.getByText('+1 overridden'));

    expect(screen.getByText('Overridden rules (lower priority)')).toBeInTheDocument();
    expect(screen.getByText('WOOL')).toBeInTheDocument();
    expect(screen.getByText(/Wool Store/)).toBeInTheDocument();
    expect(screen.getByText(/Priority: 10/)).toBeInTheDocument();
  });

  it('does not show override indicator when matchedRules is absent', () => {
    render(
      <TransactionCard
        transaction={makeTx({ matchedRules: undefined })}
        readonly={true}
        variant="matched"
      />
    );

    expect(screen.queryByText(/overridden/)).toBeNull();
  });
});

describe('TransactionCard — the AI accept button names its outcome', () => {
  const aiTx = makeTx({
    status: 'uncertain',
    ruleProvenance: undefined,
    entity: { matchType: 'ai', confidence: 0.6, entityName: 'Chargefox' },
  });

  function renderAiCard(overrides: Partial<Parameters<typeof TransactionCard>[0]> = {}) {
    return render(
      <TransactionCard
        transaction={aiTx}
        variant="uncertain"
        onAcceptAiSuggestion={vi.fn()}
        entities={[{ id: 'ent_1', name: 'Chargefox' }]}
        {...overrides}
      />
    );
  }

  it('offers to assign when the suggested entity already exists', () => {
    renderAiCard();
    expect(screen.getByRole('button', { name: 'Assign to "Chargefox"' })).toBeInTheDocument();
  });

  it('offers to create when the suggested entity is absent from a complete list', () => {
    renderAiCard({ entities: [{ id: 'ent_2', name: 'Cloudflare' }] });
    expect(screen.getByRole('button', { name: 'Create "Chargefox"' })).toBeInTheDocument();
  });

  it('promises neither while the entity list is still loading', () => {
    renderAiCard({ entities: undefined });
    expect(screen.getByRole('button', { name: 'Accept "Chargefox"' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create "chargefox"/i })).not.toBeInTheDocument();
  });

  it('accepts the suggestion when clicked', () => {
    const onAcceptAiSuggestion = vi.fn();
    renderAiCard({ onAcceptAiSuggestion });
    fireEvent.click(screen.getByRole('button', { name: 'Assign to "Chargefox"' }));
    expect(onAcceptAiSuggestion).toHaveBeenCalledWith(aiTx);
  });
});
