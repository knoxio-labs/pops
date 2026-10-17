import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { describe, expect, it } from 'vitest';

import { ComputedField } from './computed-field';
import { fieldInputValue } from './field-input-props';
import { blankDraft, draftReducer } from './form-draft';
import { TextFieldEditor } from './text-field-editor';

import type { ReactElement } from 'react';

import type { FormFieldDef } from './field-model';

function field(
  kind: FormFieldDef['kind'],
  cardinality: FormFieldDef['cardinality'] = 'one'
): FormFieldDef {
  return {
    id: 'value',
    key: 'value',
    label: 'Value',
    kind,
    cardinality,
    required: false,
    storage: 'stored',
    allowOverride: false,
    help: null,
    fixedUnit: kind === 'measurement' ? 'kg' : null,
    enumOptions: [],
    referenceKinds: [],
    referenceTypeIds: [],
    expression: null,
  };
}

const EMPTY_VALUES = [''];

function Editor({
  definition,
  initial = EMPTY_VALUES,
}: {
  readonly definition: FormFieldDef;
  readonly initial?: readonly string[];
}): ReactElement {
  const [draft, dispatch] = useReducer(draftReducer, {
    ...blankDraft(),
    fields: { text: { value: initial }, refs: {}, booleans: {} },
    overrides: definition.storage === 'computed' ? { value: initial[0] ?? '' } : {},
  });
  return definition.storage === 'computed' ? (
    <ComputedField field={definition} draft={draft} dispatch={dispatch} computed={undefined} />
  ) : (
    <TextFieldEditor field={definition} draft={draft} dispatch={dispatch} />
  );
}

describe('item field editing', () => {
  it.each(['integer', 'decimal', 'measurement'] as const)(
    'keeps %s focused through multiple digits',
    async (kind) => {
      const user = userEvent.setup();
      render(<Editor definition={field(kind)} />);
      const input = screen.getByRole('spinbutton', { name: 'Value 1' });
      await user.type(input, '12345');
      expect(input).toHaveFocus();
      expect(input).toHaveValue(12345);
      expect(screen.getByRole('spinbutton', { name: 'Value 1' })).toBe(input);
    }
  );

  it.each(['stored', 'computed'] as const)(
    'displays saved %s instants locally without changing raw drafts',
    (storage) => {
      const timestamp = '2026-04-04T16:30:00.123Z';
      render(
        <Editor
          definition={{ ...field('date_time'), storage, allowOverride: true }}
          initial={[timestamp]}
        />
      );
      expect(
        screen.getByLabelText(storage === 'stored' ? 'Value 1' : 'Value override')
      ).toHaveValue(
        new Date(timestamp).toLocaleString('sv-SE', { hour12: false }).replace(' ', 'T') + '.123'
      );
      expect(fieldInputValue('date_time', '2026-04-05T02:30')).toBe('2026-04-05T02:30');
      expect(fieldInputValue('date_time', 'invalidZ')).toBe('invalidZ');
      expect(fieldInputValue('short_text', timestamp)).toBe(timestamp);
    }
  );

  it.each(['short_text', 'long_text', 'url'] as const)(
    'keeps %s focused while typing and replacing text',
    async (kind) => {
      const user = userEvent.setup();
      render(<Editor definition={field(kind)} />);
      const input = screen.getByRole('textbox', { name: 'Value 1' });
      await user.type(input, 'first value');
      expect(input).toHaveFocus();
      expect(input).toHaveValue('first value');
      await user.clear(input);
      await user.type(input, 'replacement');
      expect(input).toHaveFocus();
      expect(input).toHaveValue('replacement');
      expect(screen.getByRole('textbox', { name: 'Value 1' })).toBe(input);
    }
  );

  it('preserves repeated input identity through duplicates, additions and removal', async () => {
    const user = userEvent.setup();
    render(<Editor definition={field('short_text', 'many')} initial={['same', 'same']} />);
    const first = screen.getByRole('textbox', { name: 'Value 1' });
    const second = screen.getByRole('textbox', { name: 'Value 2' });
    await user.type(second, ' text');
    expect(second).toHaveValue('same text');
    expect(second).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Add value' }));
    const third = screen.getByRole('textbox', { name: 'Value 3' });
    await user.type(third, 'third');
    const row = first.parentElement?.parentElement;
    if (row === null || row === undefined) throw new Error('Expected field row');
    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('textbox', { name: 'Value 1' })).toBe(second);
    expect(screen.getByRole('textbox', { name: 'Value 2' })).toBe(third);
    await user.type(second, '!');
    expect(second).toHaveValue('same text!');
    expect(second).toHaveFocus();
  });

  it.each(['decimal', 'measurement', 'date_time', 'integer'] as const)(
    'aligns native %s constraints for stored values and overrides',
    (kind) => {
      const value = kind === 'date_time' ? '2026-10-17T12:34:56.123' : '1.25';
      for (const storage of ['stored', 'computed'] as const) {
        const { unmount } = render(
          <Editor definition={{ ...field(kind), storage, allowOverride: true }} />
        );
        const input = screen.getByLabelText(storage === 'stored' ? 'Value 1' : 'Value override');
        if (!(input instanceof HTMLInputElement)) throw new Error('Expected native input');
        input.min = kind === 'date_time' ? '2026-10-17T00:00' : '0';
        fireEvent.change(input, { target: { value } });
        expect(input.validity.stepMismatch).toBe(kind === 'integer');
        expect(input).toHaveValue(kind === 'date_time' ? value : 1.25);
        unmount();
      }
    }
  );
});
