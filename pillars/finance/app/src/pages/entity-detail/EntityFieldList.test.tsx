import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EntityFieldList } from './EntityFieldList';

import type { Entity } from '../../contacts-api/types.gen.js';

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent-1',
    name: 'Woolworths',
    type: 'company',
    aliases: [],
    defaultTags: [],
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('EntityFieldList', () => {
  it('renders ABN, aliases and notes when all are set', () => {
    render(
      <EntityFieldList
        entity={entity({
          abn: '88 000 014 675',
          aliases: ['Woolworths Group', 'WW Supermarkets'],
          notes: 'Weekly groceries',
        })}
      />
    );

    expect(screen.getByText('88 000 014 675')).toBeInTheDocument();
    expect(screen.getByText('Woolworths Group, WW Supermarkets')).toBeInTheDocument();
    expect(screen.getByText('Weekly groceries')).toBeInTheDocument();
  });

  it('falls back to muted placeholders when every field is unset', () => {
    render(<EntityFieldList entity={entity()} />);

    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('No notes')).toBeInTheDocument();
  });

  it('never renders default transaction type or default tags — those are finance-owned', () => {
    render(
      <EntityFieldList
        entity={entity({ defaultTransactionType: 'expense', defaultTags: ['category:groceries'] })}
      />
    );

    expect(screen.queryByText('expense')).not.toBeInTheDocument();
    expect(screen.queryByText('category:groceries')).not.toBeInTheDocument();
    expect(screen.queryByText('Default tags')).not.toBeInTheDocument();
    expect(screen.queryByText('Default type')).not.toBeInTheDocument();
  });
});
