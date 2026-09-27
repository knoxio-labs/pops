import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { blankDraft } from './form-draft';
import { ReferenceField } from './reference-field';

import type { WebSearchApi } from '../../inventory-web/useWebSearch.js';
import type { FormFieldDef, ReferenceChoice } from './field-model';

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

function search(status: WebSearchApi['status']): WebSearchApi {
  return {
    results: emptyResults,
    status,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function renderField(
  status: WebSearchApi['status'],
  refs: Readonly<Record<string, readonly ReferenceChoice[]>> = {}
) {
  mocks.useWebSearch.mockReturnValue(search(status));
  render(
    <ReferenceField
      field={referenceField}
      draft={{ ...blankDraft(), fields: { text: {}, refs, booleans: {} } }}
      error={refs.related === undefined ? undefined : 'Related does not allow places.'}
      dispatch={vi.fn()}
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
});
