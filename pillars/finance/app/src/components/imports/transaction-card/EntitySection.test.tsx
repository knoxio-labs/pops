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
    account: 'Amex',
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

  it('keeps Accept as the one-click path but drops the duplicate create buttons', () => {
    renderSection();

    expect(screen.getByRole('button', { name: /accept "McDonald's"/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^create new$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create new entity/i })).not.toBeInTheDocument();
  });
});
