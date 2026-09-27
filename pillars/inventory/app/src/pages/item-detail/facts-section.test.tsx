import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { FactsSection } from './facts-section';

import type { FieldDrafts, FormFieldDef } from '../item-form/field-model';
import type { FactEditing, FactPhase } from './use-fact-editing';

const field: FormFieldDef = {
  id: 'serial-id',
  key: 'serial',
  label: 'Serial',
  kind: 'short_text',
  cardinality: 'one',
  required: false,
  storage: 'stored',
  allowOverride: false,
  help: null,
  fixedUnit: null,
  enumOptions: [],
  referenceKinds: [],
  referenceTypeIds: [],
  expression: null,
};

const drafts: FieldDrafts = { text: { [field.id]: ['old'] }, refs: {}, booleans: {} };
const fact = {
  key: 'serial',
  label: 'Serial',
  value: 'old',
  origin: 'entered' as const,
  inline: true,
};

function createEditing(phase: { current: FactPhase }): FactEditing {
  return {
    phaseOf: vi.fn(() => phase.current),
    drafts,
    rejection: null,
    problem: null,
    fieldOf: vi.fn((key: string) => (key === field.key ? field : null)),
    world: buildWorld([], []),
    typeLabel: () => 'Hardware',
    start: vi.fn(),
    change: vi.fn(),
    save: vi.fn(),
    revert: vi.fn(),
  };
}

describe('FactsSection', () => {
  it('opens the stable-key editor and saves it with Enter', () => {
    const phase = { current: 'idle' as FactPhase };
    const editing = createEditing(phase);
    const { rerender } = render(
      <FactsSection facts={[fact]} typeName="Hardware" editing={editing} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Serial' }));
    expect(editing.start).toHaveBeenCalledWith('serial');

    phase.current = 'editing';
    rerender(<FactsSection facts={[fact]} typeName="Hardware" editing={editing} />);
    const input = screen.getByRole('textbox', { name: 'Serial 1' });
    fireEvent.change(input, { target: { value: 'new' } });
    expect(editing.change).toHaveBeenCalledWith({
      ...drafts,
      text: { [field.id]: ['new'] },
    });

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(editing.save).toHaveBeenCalledOnce();
  });

  it('does not expose editing for a computed fact', () => {
    const editing = createEditing({ current: 'idle' });
    render(
      <FactsSection
        facts={[{ ...fact, key: 'calculated', origin: 'overridden', inline: false }]}
        typeName="Hardware"
        editing={editing}
      />
    );

    expect(screen.queryByRole('button', { name: 'Edit Serial' })).not.toBeInTheDocument();
  });
});
