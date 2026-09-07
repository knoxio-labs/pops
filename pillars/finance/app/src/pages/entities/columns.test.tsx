import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from '@pops/ui';

import { buildEntityColumns } from './columns';

import type { Entity } from './types';

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent-1',
    name: 'Woolworths',
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    avatarAssetId: null,
    colour: null,
    transactionCount: 3,
    ...overrides,
  };
}

describe('buildEntityColumns — name cell', () => {
  it('links each row to its detail page at /finance/entities/:id', () => {
    const columns = buildEntityColumns({ onEdit: vi.fn(), onDelete: vi.fn() });
    render(
      <MemoryRouter>
        <DataTable columns={columns} data={[entity({ id: 'ent-7', name: 'Bunnings' })]} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: /Bunnings/ });
    expect(link).toHaveAttribute('href', '/finance/entities/ent-7');
  });
});
