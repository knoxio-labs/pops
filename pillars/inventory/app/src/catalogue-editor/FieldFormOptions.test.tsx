import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EnumOptions } from './FieldFormOptions';

import type { CatalogueField } from './types';

const field: CatalogueField = {
  allowOverride: false,
  archivedAt: null,
  cardinality: 'one',
  enumOptions: [
    {
      archivedAt: '2026-09-23T00:00:00.000Z',
      id: '33333333-3333-4333-8333-333333333333',
      key: 'archived',
      label: 'Archived option',
      sortOrder: 0,
    },
  ],
  expression: null,
  expressionVersion: null,
  fixedUnit: null,
  help: null,
  id: '22222222-2222-4222-8222-222222222222',
  key: 'condition',
  kind: 'enum',
  label: 'Condition',
  presentation: {},
  referenceKinds: [],
  referenceTypeIds: [],
  replacedBy: null,
  required: false,
  sortOrder: 0,
  storage: 'stored',
  typeId: '11111111-1111-4111-8111-111111111111',
};

describe('EnumOptions', () => {
  it('restores an archived option without changing its identity', () => {
    const onOperation = vi.fn();
    render(<EnumOptions field={field} onOperation={onOperation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Restore Archived option' }));

    expect(onOperation).toHaveBeenCalledWith({
      kind: 'put_enum_option',
      id: field.enumOptions[0]?.id,
      fieldId: field.id,
      archivedAt: null,
    });
  });

  it('adds a new option keyed from its label at the next sort order', () => {
    const onOperation = vi.fn();
    render(<EnumOptions field={field} onOperation={onOperation} />);

    fireEvent.change(screen.getByLabelText('Option label'), {
      target: { value: 'Like new' },
    });
    expect(screen.getByLabelText('Key')).toHaveValue('like_new');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onOperation).toHaveBeenCalledWith({
      kind: 'put_enum_option',
      fieldId: field.id,
      key: 'like_new',
      label: 'Like new',
      sortOrder: field.enumOptions.length,
    });
    expect(screen.getByLabelText('Option label')).toHaveValue('');
  });

  it('archives an active option instead of deleting its identity', () => {
    const active = { ...field, enumOptions: [{ ...field.enumOptions[0]!, archivedAt: null }] };
    const onOperation = vi.fn();
    render(<EnumOptions field={active} onOperation={onOperation} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive Archived option' }));

    expect(onOperation).toHaveBeenCalledWith({
      kind: 'archive_enum_option',
      id: active.enumOptions[0]?.id,
    });
  });

  it('disables adding an option with a blank label', () => {
    render(<EnumOptions field={field} onOperation={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
