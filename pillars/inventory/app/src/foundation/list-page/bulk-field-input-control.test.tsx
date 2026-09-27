import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BulkFieldInputControl } from './bulk-field-input-control.js';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { WebSearchApi } from '../../inventory-web/useWebSearch.js';

const mocks = vi.hoisted(() => ({ useWebSearch: vi.fn() }));

vi.mock('../../inventory-web/useWebSearch.js', () => ({ useWebSearch: mocks.useWebSearch }));

type CatalogueField = CatalogueType['fields'][number];

const referenceField: CatalogueField = {
  allowOverride: false,
  archivedAt: null,
  cardinality: 'many',
  defaultValues: [],
  enumOptions: [],
  expression: null,
  expressionVersion: null,
  fixedUnit: null,
  help: null,
  id: 'related',
  key: 'related',
  kind: 'reference',
  label: 'Related',
  presentation: {},
  referenceKinds: ['item'],
  referenceTypeIds: [],
  replacedBy: null,
  required: false,
  sortOrder: 0,
  storage: 'stored',
  typeId: 'type-lamp',
};

function search(): WebSearchApi {
  return {
    results: {
      exact: null,
      items: [
        {
          kind: 'item',
          item: {
            id: 'item-1',
            name: 'Desk lamp',
            typeId: 'type-lamp',
            typeName: 'Lamp',
            code: null,
            quantity: 1,
            container: null,
            lifecycle: 'active',
            placement: { kind: 'in-hand' },
            previous: null,
            sync: 'synced',
            photoUrl: null,
            note: null,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          tier: 'prefix',
          field: null,
        },
      ],
      places: [],
      total: 1,
    },
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

describe('BulkFieldInputControl', () => {
  it('uses the typed reference editor and keeps the selected target metadata', () => {
    mocks.useWebSearch.mockReturnValue(search());
    const onChange = vi.fn();

    render(<BulkFieldInputControl field={referenceField} value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Related' }), {
      target: { value: 'desk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Desk lamp' }));

    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'item-1',
        kind: 'item',
        label: 'Desk lamp',
        typeId: 'type-lamp',
        typeName: 'Lamp',
      },
    ]);
  });
});
