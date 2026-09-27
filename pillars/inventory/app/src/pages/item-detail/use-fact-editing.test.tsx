import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { coreWorld } from '../../foundation/test-fixtures/core';

const mocks = vi.hoisted(() => ({
  bulk: { editValues: vi.fn() },
  pending: new Set<string>(),
}));

vi.mock('../../inventory-web/useCatalogueLookups', () => ({
  useCatalogueLookups: () => ({
    typeNameForId: (id: string | null | undefined) => (id === 'type-tools' ? 'Tools' : null),
  }),
}));

vi.mock('../../inventory-web/item-verbs-bulk', () => ({
  useBulkItemVerbs: () => mocks.bulk,
}));

vi.mock('../../inventory-web/item-verbs', () => ({
  usePendingItemIds: () => mocks.pending,
}));

import { useFactEditing } from './use-fact-editing';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups';
import type { FactEditingModel } from './use-fact-editing';

const catalogueType = {
  archivedAt: null,
  capabilities: [],
  description: null,
  fields: [
    {
      allowOverride: false,
      archivedAt: null,
      cardinality: 'one',
      defaultValues: [],
      enumOptions: [],
      expression: null,
      expressionVersion: null,
      fixedUnit: null,
      help: null,
      id: 'field-serial',
      key: 'serial',
      kind: 'reference',
      label: 'Serial item',
      presentation: {},
      referenceKinds: ['item'],
      referenceTypeIds: [],
      replacedBy: null,
      required: false,
      sortOrder: 0,
      storage: 'stored',
      typeId: 'type-tools',
    },
    {
      allowOverride: false,
      archivedAt: null,
      cardinality: 'one',
      defaultValues: [],
      enumOptions: [],
      expression: null,
      expressionVersion: null,
      fixedUnit: null,
      help: null,
      id: 'field-computed',
      key: 'computed',
      kind: 'short_text',
      label: 'Computed',
      presentation: {},
      referenceKinds: [],
      referenceTypeIds: [],
      replacedBy: null,
      required: false,
      sortOrder: 1,
      storage: 'computed',
      typeId: 'type-tools',
    },
  ],
  id: 'type-tools',
  key: 'tools',
  label: 'Tools',
  legacyLabels: [],
  presentation: {},
  replacedBy: null,
  revision: 1,
  sortOrder: 0,
} satisfies CatalogueType;

function model(): FactEditingModel {
  return {
    item: { id: 'itm-drill', typeId: 'type-tools' },
    aggregate: {
      type: catalogueType,
      fieldValues: [
        {
          fieldId: 'field-serial',
          source: 'stored',
          values: [{ targetId: 'itm-tape', targetKind: 'item' }],
        },
      ],
    },
    relatedWorld: coreWorld,
  };
}

function applied() {
  return { applied: ['itm-drill'], refused: [], undo: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending.clear();
  mocks.bulk.editValues.mockResolvedValue(applied());
});

describe('useFactEditing', () => {
  it('looks up fields by key, names references, and excludes computed fields', () => {
    const { result } = renderHook(() => useFactEditing(model()));

    expect(result.current.fieldOf('serial')).toMatchObject({ id: 'field-serial' });
    expect(result.current.fieldOf('field-serial')).toBeNull();
    expect(result.current.fieldOf('computed')).toBeNull();
    expect(result.current.typeLabel('type-tools')).toBe('Tools');

    act(() => result.current.start('serial'));
    expect(result.current.phaseOf('serial')).toBe('editing');
    expect(result.current.drafts.refs['field-serial']?.[0]?.label).toBe('Tape measure');
  });

  it('blocks a second reference on a one-cardinality field before sending', () => {
    const { result } = renderHook(() => useFactEditing(model()));
    const first = result.current.drafts.refs['field-serial']?.[0];
    if (first === undefined) throw new Error('expected the initial reference');

    act(() => {
      result.current.start('serial');
    });
    act(() =>
      result.current.change({
        ...result.current.drafts,
        refs: {
          ...result.current.drafts.refs,
          'field-serial': [first, { id: 'itm-drill', kind: 'item', label: 'Cordless drill' }],
        },
      })
    );
    act(() => result.current.save());

    expect(result.current.problem).toBe('Choose one value.');
    expect(mocks.bulk.editValues).not.toHaveBeenCalled();
  });

  it('shows saving and then returns to idle after an applied edit', async () => {
    let resolve: ((value: ReturnType<typeof applied>) => void) | undefined;
    mocks.bulk.editValues.mockReturnValueOnce(
      new Promise((finish) => {
        resolve = finish;
      })
    );
    const { result } = renderHook(() => useFactEditing(model()));

    act(() => result.current.start('serial'));
    act(() => result.current.save());
    expect(result.current.phaseOf('serial')).toBe('saving');
    expect(mocks.bulk.editValues).toHaveBeenCalledWith([
      {
        id: 'itm-drill',
        patches: [
          { fieldId: 'field-serial', values: [{ targetId: 'itm-tape', targetKind: 'item' }] },
        ],
      },
    ]);

    if (resolve === undefined) throw new Error('edit promise did not expose a resolver');
    await act(async () => resolve?.(applied()));
    await waitFor(() => expect(result.current.phaseOf('serial')).toBe('idle'));
  });

  it('marks an edit pending when another mutation is already in flight', () => {
    mocks.pending.add('itm-drill');
    mocks.bulk.editValues.mockReturnValueOnce(new Promise(() => undefined));
    const { result } = renderHook(() => useFactEditing(model()));

    act(() => result.current.start('serial'));
    act(() => result.current.save());

    expect(result.current.phaseOf('serial')).toBe('pending');
  });

  it('restores the old draft and exposes the server refusal', async () => {
    mocks.bulk.editValues.mockResolvedValueOnce({
      applied: [],
      refused: [
        {
          id: 'itm-drill',
          refusal: {
            kind: 'outcome',
            outcome: { status: 'rejected', reason: 'Catalogue changed.' },
          },
        },
      ],
      undo: null,
    });
    const { result } = renderHook(() => useFactEditing(model()));

    act(() => result.current.start('serial'));
    act(() => result.current.save());
    await waitFor(() => expect(result.current.phaseOf('serial')).toBe('rejected'));

    expect(result.current.rejection).toEqual({ key: 'serial', reason: 'Catalogue changed.' });
    expect(result.current.drafts.refs['field-serial']?.[0]?.label).toBe('Tape measure');
  });
});
