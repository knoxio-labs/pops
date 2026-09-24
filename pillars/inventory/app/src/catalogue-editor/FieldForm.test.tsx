import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
    replacedBy: null,
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
    replacedBy: null,
    revision: 1,
    sortOrder: 0,
  };
}

function renderField(target: CatalogueField, siblings: CatalogueField[] = [], published = false) {
  const itemType = type([target, ...siblings]);
  const onOperation = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FieldForm
        field={target}
        isPending={false}
        onOperation={onOperation}
        published={published}
        type={itemType}
        types={[itemType]}
      />
    </QueryClientProvider>
  );
  return onOperation;
}

describe('FieldForm configuration branches', () => {
  it.each(KIND_LABELS)('selects the %s primitive as %s', (kind, label) => {
    renderField(field({ kind, fixedUnit: kind === 'measurement' ? 'cm' : null }));

    expect(screen.getByRole('combobox')).toHaveTextContent(label);
  });

  it.each(KIND_LABELS)('submits the %s configuration in the put_field request', (kind) => {
    const configured = field({
      kind,
      cardinality: kind === 'boolean' ? 'one' : 'many',
      fixedUnit: kind === 'measurement' ? 'cm' : null,
      referenceKinds: kind === 'reference' ? ['item'] : [],
      referenceTypeIds: kind === 'reference' ? [TYPE_ID] : [],
    });
    const onOperation = renderField(configured);

    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));

    expect(onOperation).toHaveBeenCalledWith({
      kind: 'put_field',
      typeId: TYPE_ID,
      id: configured.id,
      label: 'Detail',
      help: null,
      required: false,
      presentation: { highlighted: false },
      fieldKind: kind,
      cardinality: kind === 'boolean' ? 'one' : 'many',
      storage: 'stored',
      fixedUnit: kind === 'measurement' ? 'cm' : null,
      referenceKinds: kind === 'reference' ? ['item'] : [],
      referenceTypeIds: kind === 'reference' ? [TYPE_ID] : [],
      expressionVersion: null,
      expression: null,
      allowOverride: false,
    });
  });

  it('submits a trimmed fixed unit for a measurement field', () => {
    const onOperation = renderField(field({ kind: 'measurement', fixedUnit: 'kg' }));

    fireEvent.change(screen.getByLabelText('Fixed unit'), { target: { value: '  cm  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));

    expect(onOperation).toHaveBeenCalledWith(expect.objectContaining({ fixedUnit: 'cm' }));
  });

  it('submits required, highlighted, and trimmed help text changes', () => {
    const onOperation = renderField(field());

    fireEvent.click(screen.getByLabelText('Required'));
    fireEvent.click(screen.getByLabelText('Highlighted'));
    fireEvent.change(screen.getByLabelText('Help text'), {
      target: { value: '  Shown on the item detail page  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));

    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        required: true,
        presentation: { highlighted: true },
        help: 'Shown on the item detail page',
      })
    );
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

  it('loads a stored computed expression into the builder outline', () => {
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

    expect(screen.getByTestId('expression-readback')).toHaveTextContent('Width × Height');
    expect(screen.getByRole('list', { name: 'Expression outline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save field' })).toBeEnabled();
  });

  it('keeps ordinary stored primitives free of special controls', () => {
    renderField(field({ kind: 'long_text', cardinality: 'many' }));

    expect(screen.queryByText('Reference targets')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Computation' })).not.toBeInTheDocument();
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

  it('blocks saving a computed field while its expression is empty', () => {
    renderField(field({ storage: 'computed' }));

    expect(screen.getByText('No expression yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save field' })).toBeDisabled();
  });

  it('blocks saving a reference field with no target kind checked and explains why', () => {
    renderField(field({ kind: 'reference', referenceKinds: [] }));

    expect(screen.getByLabelText('Inventory item')).not.toBeChecked();
    expect(screen.getByLabelText('Location')).not.toBeChecked();
    expect(
      screen.getByText(/Choose at least one target kind: item, location, or both\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save field' })).toBeDisabled();
  });

  it('re-enables saving a reference field once a target kind is checked', () => {
    renderField(field({ kind: 'reference', referenceKinds: [] }));

    fireEvent.click(screen.getByLabelText('Location'));

    expect(
      screen.queryByText(/Choose at least one target kind: item, location, or both\./)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save field' })).toBeEnabled();
  });

  it('shows the no-target-kind guidance for allowed item types', () => {
    renderField(field({ kind: 'reference', referenceKinds: ['item'] }));

    expect(
      screen.getByText('None checked allows every item type. Types never limit locations.')
    ).toBeInTheDocument();
  });

  it('shows the unit dimension readout for a recognised measurement unit', () => {
    renderField(field({ kind: 'measurement', fixedUnit: 'cm' }));

    expect(screen.getByText('length')).toBeInTheDocument();
  });

  it('shows the compound unit dimension for a derived measurement unit', () => {
    renderField(field({ kind: 'measurement', fixedUnit: 'kg/m³' }));

    expect(screen.getByText('mass·length⁻³')).toBeInTheDocument();
  });

  it('reads an unrecognised measurement unit back as itself rather than guessing a dimension', () => {
    renderField(field({ kind: 'measurement', fixedUnit: 'crates' }));

    expect(screen.getByText('crates')).toBeInTheDocument();
  });

  it('shows a value-rule hint under the primitive kind picker', () => {
    renderField(field({ kind: 'short_text' }));

    expect(screen.getByText('Up to 200 characters.')).toBeInTheDocument();
  });

  it('shows the decimal precision hint under the primitive kind picker', () => {
    renderField(field({ kind: 'decimal' }));

    expect(
      screen.getByText('Up to 18 significant digits, up to 9 decimal places.')
    ).toBeInTheDocument();
  });
});
