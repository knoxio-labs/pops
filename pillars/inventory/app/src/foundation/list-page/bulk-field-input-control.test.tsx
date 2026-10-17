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
  it('explains invalid scalar input and clears the error when the draft is corrected', () => {
    const field = { ...referenceField, kind: 'integer' as const };
    const { rerender } = render(
      <BulkFieldInputControl field={field} value="9007199254740993" onChange={vi.fn()} />
    );
    const input = screen.getByLabelText('Related');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Related is too large to store.');
    expect(input).toHaveAccessibleDescription('Related is too large to store.');
    rerender(<BulkFieldInputControl field={field} value="12" onChange={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it.each([
    { kind: 'integer', type: 'number', step: '1' },
    { kind: 'decimal', type: 'number', step: 'any' },
    { kind: 'measurement', type: 'number', step: 'any' },
    { kind: 'date_time', type: 'datetime-local', step: '0.001' },
  ] as const)(
    'matches the $kind input constraints to its wire contract',
    ({ kind, type, step }) => {
      render(
        <BulkFieldInputControl field={{ ...referenceField, kind }} value="" onChange={vi.fn()} />
      );
      const input = screen.getByLabelText('Related');
      expect(input).toHaveAttribute('type', type);
      expect(input).toHaveAttribute('step', step);
    }
  );

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
