import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ComputedField } from './computed-field';
import { formatComputedValue } from './computed-value';
import { blankDraft } from './form-draft';

import type { FormFieldDef } from './field-model';

function field(kind: FormFieldDef['kind'], overrides: Partial<FormFieldDef> = {}): FormFieldDef {
  return {
    id: 'computed-value',
    key: 'computed_value',
    label: 'Computed value',
    kind,
    cardinality: 'one',
    required: false,
    storage: 'computed',
    allowOverride: false,
    help: null,
    fixedUnit: kind === 'measurement' ? 'kg' : null,
    enumOptions:
      kind === 'enum' ? [{ id: 'option-red', key: 'red', label: 'Red', archivedAt: null }] : [],
    referenceKinds: kind === 'reference' ? ['item'] : [],
    referenceTypeIds: [],
    expression: {},
    ...overrides,
  };
}

describe('ComputedField', () => {
  it('shows a pending state before a saved item has computed values', () => {
    render(
      <ComputedField
        field={field('decimal')}
        draft={blankDraft()}
        computed={undefined}
        dispatch={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Will calculate after saving.');
  });

  it('shows the server unavailable reason and supports an override', () => {
    render(
      <ComputedField
        field={field('decimal', { allowOverride: true })}
        draft={blankDraft()}
        computed={{
          state: 'unavailable',
          values: [],
          reason: 'Price is missing.',
          missingInputs: ['price'],
        }}
        dispatch={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Price is missing.');
    expect(screen.getByRole('spinbutton', { name: 'Computed value override' })).toBeInTheDocument();
  });

  it('renders typed enum, measurement and reference results and flags malformed values', () => {
    expect(formatComputedValue(field('enum'), { optionId: 'option-red' })).toBe('Red');
    expect(formatComputedValue(field('measurement'), { amount: '1.25', unit: 'kg' })).toBe(
      '1.25 kg'
    );
    expect(
      formatComputedValue(field('reference'), { targetKind: 'item', targetId: 'item-1' })
    ).toBe('Item item-1');

    render(
      <ComputedField
        field={field('enum')}
        draft={blankDraft()}
        computed={{
          state: 'ok',
          values: [{ optionId: 'missing' }],
          reason: null,
          missingInputs: [],
        }}
        dispatch={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Invalid value.');
    expect(screen.getByRole('status')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rounds computed measurements only for display', () => {
    expect(
      formatComputedValue(field('measurement', { decimalPlaces: 1 }), {
        amount: '24.0000',
        unit: 'kg',
      })
    ).toBe('24.0 kg');
  });

  it('rounds computed decimals only for display', () => {
    expect(formatComputedValue(field('decimal', { decimalPlaces: 1 }), '24.05')).toBe('24.1');
  });
});
