import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { BulkActionSheets } from './bulk-action-sheets.js';

import type { ComponentProps } from 'react';

import type {
  CatalogueDescriptor,
  CatalogueType,
} from '../../inventory-web/useCatalogueLookups.js';
import type { ItemRowModel } from '../model/model.js';

type CatalogueField = CatalogueType['fields'][number];

function field(typeId: string, id: string, label: string): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    defaultValues: [],
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id,
    key: id,
    kind: 'short_text',
    label,
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId,
  };
}

function type(id: string, label: string, fields: readonly CatalogueField[] = []): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [...fields],
    id,
    key: id,
    label,
    legacyLabels: [],
    parentTypeId: null,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function catalogue(types: readonly CatalogueType[]): CatalogueDescriptor {
  const actor = { id: 'test', kind: 'web' as const, label: 'Test' };
  return {
    revision: {
      abandoned: null,
      baseRevision: null,
      created: { actor, at: '2026-09-01T00:00:00.000Z' },
      draftVersion: 1,
      minimumProtocol: 2,
      published: { actor, at: '2026-09-01T00:00:00.000Z', note: null },
      revision: 1,
      status: 'published',
    },
    types: [...types],
  };
}

const row: ItemRowModel = {
  id: 'item-1',
  name: 'Desk lamp',
  typeId: 'type-old',
  typeName: 'Old type',
  code: null,
  quantity: 1,
  container: null,
  lifecycle: 'active',
  placement: { kind: 'in-hand' },
  previous: null,
  sync: 'synced',
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function props(action: 'set-type' | 'set-field'): ComponentProps<typeof BulkActionSheets> {
  const fieldDefinition = field('type-old', 'colour', 'Colour');
  return {
    action: { kind: action, ids: ['item-1'] },
    rows: [row],
    catalogue: catalogue([
      type('type-old', 'Old type', [fieldDefinition]),
      type('type-new', 'New type'),
    ]),
    busy: false,
    onOpenChange: vi.fn(),
    onSetType: vi.fn(async () => undefined),
    onSetField: vi.fn(async () => undefined),
    onLifecycle: vi.fn(async () => undefined),
  };
}

describe('BulkActionSheets', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('confirms a selected target type', () => {
    const input = props('set-type');
    render(<BulkActionSheets {...input} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'New type' }));
    fireEvent.click(screen.getByRole('option', { name: 'New type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set type on 1 item' }));

    expect(input.onSetType).toHaveBeenCalledWith('type-new');
  });

  it('encodes a field value before confirming the compatible rows', () => {
    const input = props('set-field');
    render(<BulkActionSheets {...input} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Colour' }), {
      target: { value: 'blue' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set on 1 item' }));

    expect(input.onSetField).toHaveBeenCalledWith('colour', 'blue');
  });
});
