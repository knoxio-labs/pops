import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FieldForm } from './FieldForm';

import type { CatalogueField, CatalogueType } from './types';

const TYPE_ID = '11111111-1111-4111-8111-111111111111';
const KIND_LABELS = [
  ['short_text', 'Short text'],
  ['long_text', 'Long text'],
  ['integer', 'Integer'],
  ['decimal', 'Decimal'],
  ['boolean', 'Yes / no'],
  ['enum', 'Options'],
  ['measurement', 'Measurement'],
  ['date', 'Date'],
  ['date_time', 'Date and time'],
  ['url', 'URL'],
  ['reference', 'Reference'],
] as const satisfies readonly (readonly [CatalogueField['kind'], string])[];

function field(overrides: Partial<CatalogueField> = {}): CatalogueField {
  return {
    allowOverride: false,
    archivedAt: null,
    cardinality: 'one',
    enumOptions: [],
    expression: null,
    expressionVersion: null,
    fixedUnit: null,
    help: null,
    id: '22222222-2222-4222-8222-222222222222',
    key: 'detail',
    kind: 'short_text',
    label: 'Detail',
    presentation: {},
    referenceKinds: [],
    referenceTypeIds: [],
    required: false,
    sortOrder: 0,
    storage: 'stored',
    typeId: TYPE_ID,
    ...overrides,
  };
}

function type(fields: CatalogueField[]): CatalogueType {
  return {
    archivedAt: null,
    capabilities: [],
    description: null,
    fields,
    id: TYPE_ID,
    key: 'equipment',
    label: 'Equipment',
    legacyLabels: [],
    presentation: {},
    revision: 1,
    sortOrder: 0,
  };
}

function renderField(target: CatalogueField, siblings: CatalogueField[] = [], published = false) {
  const itemType = type([target, ...siblings]);
  const onOperation = vi.fn();
  render(
    <FieldForm
      field={target}
      isPending={false}
      onOperation={onOperation}
      published={published}
      type={itemType}
      types={[itemType]}
    />
  );
  return onOperation;
}

describe('FieldForm configuration branches', () => {
  it.each(KIND_LABELS)('selects the %s primitive as %s', (kind, label) => {
    renderField(field({ kind, fixedUnit: kind === 'measurement' ? 'cm' : null }));

    expect(screen.getByRole('combobox')).toHaveTextContent(label);
  });

  it('renders measurement units', () => {
    renderField(field({ kind: 'measurement', fixedUnit: 'cm' }));

    expect(screen.getByLabelText('Fixed unit')).toHaveValue('cm');
  });

  it('renders enum options', () => {
    renderField(
      field({
        kind: 'enum',
        enumOptions: [
          {
            archivedAt: null,
            id: '33333333-3333-4333-8333-333333333333',
            key: 'new',
            label: 'New',
            sortOrder: 0,
          },
        ],
      })
    );

    expect(screen.getByRole('heading', { name: 'Options' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('New')).toBeInTheDocument();
  });

  it('renders reference target kinds and type restrictions', () => {
    renderField(field({ kind: 'reference', referenceKinds: ['item'] }));

    expect(screen.getByRole('heading', { name: 'Reference targets' })).toBeInTheDocument();
    expect(screen.getByLabelText('Inventory item')).toBeChecked();
    expect(screen.getByLabelText('Equipment')).toBeInTheDocument();
  });

  it('renders closed computed expressions with eligible operands', () => {
    const left = field({ id: '44444444-4444-4444-8444-444444444444', label: 'Width' });
    const right = field({ id: '55555555-5555-4555-8555-555555555555', label: 'Height' });
    renderField(
      field({
        storage: 'computed',
        expressionVersion: 1,
        expression: {
          op: 'multiply',
          left: { op: 'read', path: [], fieldId: left.id },
          right: { op: 'read', path: [], fieldId: right.id },
        },
      }),
      [left, right]
    );

    expect(screen.getByText('Operation')).toBeInTheDocument();
    expect(screen.getByText('Left field')).toBeInTheDocument();
    expect(screen.getByText('Right field')).toBeInTheDocument();
  });

  it('keeps ordinary stored primitives free of special controls', () => {
    renderField(field({ kind: 'long_text', cardinality: 'many' }));

    expect(screen.queryByText('Reference targets')).not.toBeInTheDocument();
    expect(screen.queryByText('Operation')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Options' })).not.toBeInTheDocument();
  });

  it('normalises boolean fields to one value even when legacy data says many', () => {
    const target = field({ kind: 'boolean', cardinality: 'many' });
    const onOperation = renderField(target);

    expect(screen.getByLabelText('One')).toBeChecked();
    expect(screen.getByLabelText('Many')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));

    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ cardinality: 'one', fieldKind: 'boolean' })
    );
  });

  it('preserves mixed item and location reference targets', () => {
    const target = field({
      kind: 'reference',
      referenceKinds: ['item', 'location'],
      referenceTypeIds: [TYPE_ID],
    });
    const onOperation = renderField(target);

    expect(screen.getByLabelText('Inventory item')).toBeChecked();
    expect(screen.getByLabelText('Location')).toBeChecked();
    expect(screen.getByLabelText('Equipment')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));

    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceKinds: ['item', 'location'],
        referenceTypeIds: [TYPE_ID],
      })
    );
  });

  it('locks every published measurement shape control while leaving its label editable', () => {
    renderField(field({ kind: 'measurement', fixedUnit: 'kg' }), [], true);

    expect(screen.getByLabelText('Field label')).toBeEnabled();
    expect(screen.getByLabelText('Key')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByLabelText('One')).toBeDisabled();
    expect(screen.getByLabelText('Many')).toBeDisabled();
    expect(screen.getByLabelText('Fixed unit')).toBeDisabled();
    expect(screen.getByText('Published shape is locked')).toBeInTheDocument();
  });

  it('blocks a computed field with no eligible operands', () => {
    renderField(field({ storage: 'computed' }));

    expect(screen.getByRole('button', { name: 'Save field' })).toBeDisabled();
  });
});
