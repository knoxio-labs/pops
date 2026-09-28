import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { formTypesOf } from './field-model';
import { blankDraft } from './form-draft';
import { ReferenceField } from './reference-field';

import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';
import type { WebSearchApi } from '../../inventory-web/useWebSearch.js';
import type { FormFieldDef, ReferenceChoice } from './field-model';
import type { ReferenceFieldProps } from './reference-field';

const mocks = vi.hoisted(() => ({ useWebSearch: vi.fn() }));

vi.mock('../../inventory-web/useWebSearch.js', () => ({ useWebSearch: mocks.useWebSearch }));

const referenceField: FormFieldDef = {
  id: 'related',
  key: 'related',
  label: 'Related',
  kind: 'reference',
  cardinality: 'many',
  required: false,
  storage: 'stored',
  allowOverride: false,
  help: null,
  fixedUnit: null,
  enumOptions: [],
  referenceKinds: ['item'],
  referenceTypeIds: [],
  expression: null,
};

const emptyResults: WebSearchApi['results'] = {
  exact: null,
  items: [],
  places: [],
  total: 0,
};

function search(
  status: WebSearchApi['status'],
  results: WebSearchApi['results'] = emptyResults
): WebSearchApi {
  return {
    results,
    status,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function itemHit(
  id: string,
  typeId: string | null,
  typeName: string | null
): WebSearchApi['results']['items'][number] {
  return {
    kind: 'item',
    item: {
      id,
      name: id,
      typeId,
      typeName,
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
  };
}

function catalogueField(typeId: string): CatalogueType['fields'][number] {
  return {
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
    referenceTypeIds: ['type-parent'],
    replacedBy: null,
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId,
  };
}

function catalogueType(
  id: string,
  parentTypeId: string | null,
  fields: readonly CatalogueType['fields'][number][]
): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields: [...fields],
    id,
    key: id,
    label: id,
    legacyLabels: [],
    parentTypeId,
    presentation: {},
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function descendantReferenceField(): FormFieldDef {
  const types = formTypesOf({
    types: [
      catalogueType('type-parent', null, [catalogueField('type-parent')]),
      catalogueType('type-child', 'type-parent', []),
    ],
  });
  const field = types.find((type) => type.id === 'type-child')?.fields[0];
  if (field === undefined) throw new Error('descendant reference field fixture is incomplete');
  return field;
}

function renderField(
  status: WebSearchApi['status'],
  refs: Readonly<Record<string, readonly ReferenceChoice[]>> = {},
  options: {
    readonly field?: FormFieldDef;
    readonly results?: WebSearchApi['results'];
    readonly dispatch?: (action: Parameters<ReferenceFieldProps['dispatch']>[0]) => void;
  } = {}
) {
  mocks.useWebSearch.mockReturnValue(search(status, options.results));
  render(
    <ReferenceField
      field={options.field ?? referenceField}
      draft={{ ...blankDraft(), fields: { text: {}, refs, booleans: {} } }}
      error={refs.related === undefined ? undefined : 'Related does not allow places.'}
      dispatch={options.dispatch ?? vi.fn()}
      onReferenceQuery={vi.fn()}
    />
  );
}

describe('ReferenceField', () => {
  it('shows the search loading state', () => {
    renderField('pending');
    expect(screen.getByRole('status')).toHaveTextContent('Searching…');
    expect(screen.getByRole('textbox', { name: 'Related' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows a retryable search error state', () => {
    renderField('error');
    expect(screen.getByRole('alert')).toHaveTextContent('Reference search failed.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('marks a selected reference that violates the field target rule', () => {
    renderField('success', {
      related: [{ id: 'place-1', kind: 'location', label: 'Garage' }],
    });
    expect(screen.getByRole('button', { name: 'Garage ×' })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  it('accepts descendants of an allowed parent and keeps refused matches disabled with a reason', () => {
    renderField(
      'success',
      {},
      {
        field: descendantReferenceField(),
        results: {
          ...emptyResults,
          items: [
            itemHit('child-item', 'type-child', 'Child'),
            itemHit('sibling-item', 'type-sibling', 'Sibling'),
          ],
          total: 2,
        },
      }
    );

    expect(screen.getByRole('button', { name: 'child-item' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'sibling-item' })).toBeDisabled();
    expect(screen.getByText('Related does not allow this item type.')).toBeInTheDocument();
  });

  it('does not add a refused match when Enter is pressed', () => {
    const dispatch = vi.fn();
    renderField(
      'success',
      {},
      {
        field: { ...referenceField, referenceTypeIds: ['type-leaf'] },
        results: {
          ...emptyResults,
          items: [itemHit('sibling-item', 'type-sibling', 'Sibling')],
          total: 1,
        },
        dispatch,
      }
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Related' }), { key: 'Enter' });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
