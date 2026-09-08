import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EntitySection } from './EntitySection';

import type { ProcessedTransaction } from '@pops/finance';

const ENTITIES = [
  { id: 'ent-mcd', name: "McDonald's" },
  { id: 'ent-coles', name: 'Coles' },
];

function aiMatched(entityName: string): ProcessedTransaction {
  return {
    date: '2026-05-07',
    description: 'MCLUU DARLINGHURST',
    amount: -29.41,
    dialectAccountLabel: 'Amex',
    rawRow: '{"checksum":"mcluu"}',
    checksum: 'mcluu',
    entity: { entityId: 'ent-mcd', entityName, matchType: 'ai', confidence: 0.75 },
    status: 'uncertain',
  };
}

function renderSection(overrides: Partial<Parameters<typeof EntitySection>[0]> = {}) {
  return render(
    <EntitySection
      transaction={aiMatched("McDonald's")}
      entities={ENTITIES}
      entityVerification="ready"
      onEntitySelect={vi.fn()}
      onCreateEntityWithName={vi.fn()}
      onAcceptAiSuggestion={vi.fn()}
      {...overrides}
    />
  );
}

async function openPickerAndSearch(user: ReturnType<typeof userEvent.setup>, term: string) {
  await user.click(screen.getByRole('combobox'));
  await user.type(screen.getByPlaceholderText(/search entities/i), term);
}

describe('EntitySection — fixing a wrong auto-match', () => {
  /**
   * The reported failure: the AI matched "MCLUU DARLINGHURST" to McDonald's,
   * which exists, so the old create-new escape hatch was hidden — leaving no
   * way to reassign to a merchant that isn't in the list yet.
   */
  it('offers to create the typed entity even when the AI matched an existing one', async () => {
    const user = userEvent.setup();
    const onCreateEntityWithName = vi.fn();
    renderSection({ onCreateEntityWithName });

    await openPickerAndSearch(user, 'SaunaX');
    await user.click(screen.getByText(/create “SaunaX”/i));

    expect(onCreateEntityWithName).toHaveBeenCalledWith(
      expect.objectContaining({ checksum: 'mcluu' }),
      'SaunaX'
    );
  });

  it('offers no create row for a name that already exists — that is a selection', async () => {
    const user = userEvent.setup();
    renderSection();

    await openPickerAndSearch(user, "mcdonald's");

    expect(screen.queryByText(/^create /i)).not.toBeInTheDocument();
  });

  it('selects an existing entity through the same picker', async () => {
    const user = userEvent.setup();
    const onEntitySelect = vi.fn();
    renderSection({ onEntitySelect });

    await openPickerAndSearch(user, 'Coles');
    await user.click(screen.getByRole('option', { name: /coles/i }));

    expect(onEntitySelect).toHaveBeenCalledWith(
      expect.objectContaining({ checksum: 'mcluu' }),
      'ent-coles',
      'Coles'
    );
  });

  it('keeps the one-click accept path but drops the duplicate create buttons', () => {
    renderSection();

    expect(screen.getByRole('button', { name: 'Assign to "McDonald\'s"' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^create new$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create new entity/i })).not.toBeInTheDocument();
  });
});

/**
 * POPS-2692. The picker shows its placeholder for any value it cannot find,
 * so a rule-matched row carrying a dead `pending:contact:` id looked exactly
 * like a row nobody had assigned anything to.
 */
describe('EntitySection — an entity the picker cannot show', () => {
  function ruleMatched(entityId: string): ProcessedTransaction {
    return {
      date: '2026-06-29',
      description: 'APPLE.COM/BILL',
      amount: -144.99,
      dialectAccountLabel: 'ANZ Credit Card',
      rawRow: '{"checksum":"apple"}',
      checksum: 'apple',
      entity: { entityId, entityName: 'Apple', matchType: 'learned', confidence: 0.95 },
      status: 'matched',
    };
  }

  it('says the entity was never created when the id is an outbox placeholder', () => {
    renderSection({
      transaction: ruleMatched('pending:contact:4c42ebf6-f6b7-4ce5-91ab-70ac3645ecbd'),
    });

    expect(screen.getByRole('status')).toHaveTextContent(/“Apple” was never created in contacts/i);
  });

  it('says the contact is gone for a real id the loaded set does not hold', () => {
    renderSection({ transaction: ruleMatched('ent-deleted') });

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/“Apple” no longer exists in contacts/i);
    expect(notice).not.toHaveTextContent(/never created/i);
  });

  it('stays quiet for an entity the picker can show', () => {
    renderSection({ transaction: ruleMatched('ent-coles') });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays quiet while the entity list is still loading', () => {
    renderSection({ transaction: ruleMatched('ent-beyond-the-page'), entities: undefined });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

/**
 * POPS-2754/manual-entity-pick gap: `moveOneToMatched` never wrote a
 * `transactionType`, so a credit assigned through this picker stayed
 * "Untyped" forever and was silently excluded from import. The picker now
 * forces the choice before the assignment fires at all.
 */
describe('EntitySection — forcing a type on an untyped credit', () => {
  function untypedCredit(): ProcessedTransaction {
    return {
      date: '2026-05-27',
      description: 'PAYMENT FROM J COSTA-MIRANDA',
      amount: 1000,
      dialectAccountLabel: 'ANZ Everyday',
      rawRow: '{"checksum":"credit-1"}',
      checksum: 'credit-1',
      entity: { matchType: 'none' },
      status: 'uncertain',
    };
  }

  it('does not assign immediately — it prompts for a type first', async () => {
    const user = userEvent.setup();
    const onEntitySelect = vi.fn();
    renderSection({ transaction: untypedCredit(), onEntitySelect });

    await openPickerAndSearch(user, 'Coles');
    await user.click(screen.getByRole('option', { name: /coles/i }));

    expect(onEntitySelect).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: /transaction type required/i })).toBeInTheDocument();
  });

  it('keeps Confirm disabled until a type is chosen, then fires with it', async () => {
    const user = userEvent.setup();
    const onEntitySelect = vi.fn();
    renderSection({ transaction: untypedCredit(), onEntitySelect });

    await openPickerAndSearch(user, 'Coles');
    await user.click(screen.getByRole('option', { name: /coles/i }));

    const confirm = screen.getByRole('button', { name: /confirm/i });
    expect(confirm).toBeDisabled();

    await user.selectOptions(screen.getByRole('combobox', { name: /transaction type/i }), 'income');
    expect(confirm).not.toBeDisabled();

    await user.click(confirm);
    expect(onEntitySelect).toHaveBeenCalledWith(
      expect.objectContaining({ checksum: 'credit-1' }),
      'ent-coles',
      'Coles',
      'income'
    );
  });

  it('cancel discards the pending pick without assigning anything', async () => {
    const user = userEvent.setup();
    const onEntitySelect = vi.fn();
    renderSection({ transaction: untypedCredit(), onEntitySelect });

    await openPickerAndSearch(user, 'Coles');
    await user.click(screen.getByRole('option', { name: /coles/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onEntitySelect).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('group', { name: /transaction type required/i })
    ).not.toBeInTheDocument();
  });

  it('also forces a type when creating a new entity for an untyped credit', async () => {
    const user = userEvent.setup();
    const onCreateEntityWithName = vi.fn();
    renderSection({ transaction: untypedCredit(), onCreateEntityWithName });

    await openPickerAndSearch(user, 'SaunaX');
    await user.click(screen.getByText(/create “SaunaX”/i));
    expect(onCreateEntityWithName).not.toHaveBeenCalled();

    await user.selectOptions(
      screen.getByRole('combobox', { name: /transaction type/i }),
      'transfer'
    );
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onCreateEntityWithName).toHaveBeenCalledWith(
      expect.objectContaining({ checksum: 'credit-1' }),
      'SaunaX',
      'transfer'
    );
  });
});
