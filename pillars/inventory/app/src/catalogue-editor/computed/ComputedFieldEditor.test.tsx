import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { catalogueTypes, chooseOption, renderComputedField, savedExpression } from './test-utils';

import type { CatalogueField } from '../types';

type WireExpression = NonNullable<CatalogueField['expression']>;

const THEN = 'then' as const;
const ELSE = 'else' as const;

const INTEGER: Partial<CatalogueField> = { kind: 'integer', fixedUnit: null };
const TEXT: Partial<CatalogueField> = { kind: 'short_text', fixedUnit: null };
const BOOLEAN: Partial<CatalogueField> = { kind: 'boolean', fixedUnit: null };

function read(fieldId: string, ...path: string[]) {
  return { op: 'read' as const, path, fieldId };
}

function literal(value: string | number | boolean | { optionId: string }) {
  return { op: 'literal' as const, value };
}

function loaded(
  expression: WireExpression,
  shape: Partial<CatalogueField> = {}
): Partial<CatalogueField> {
  return { ...shape, expressionVersion: 1, expression };
}

function outlineRow(path: string): HTMLElement {
  const outline = screen.getByRole('list', { name: 'Expression outline' });
  const row = outline.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (row === null) throw new Error(`no outline row at ${path}`);
  return row;
}

function pick(name: RegExp | string) {
  const palette = screen.getByRole('region', { name: 'Choose an operation' });
  fireEvent.click(within(palette).getByRole('button', { name }));
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save field' }));
}

describe('building each node kind', () => {
  it('multiplies two measurements, offering any number to a factor', async () => {
    const { onOperation } = renderComputedField();

    pick('Multiply');
    pick('Field');
    fireEvent.click(outlineRow('expression.right'));
    pick('Field');
    await chooseOption(screen.getByLabelText('Field on Storage box'), 'Height');
    save();

    expect(savedExpression(onOperation)).toEqual({
      op: 'multiply',
      left: read('width'),
      right: read('height'),
    });
    expect(onOperation).toHaveBeenLastCalledWith(expect.objectContaining({ expressionVersion: 2 }));
  });

  it('adds a fixed whole number typed into the literal inspector', () => {
    const { onOperation } = renderComputedField({ volume: INTEGER });

    pick('Add');
    pick('Field');
    fireEvent.click(outlineRow('expression.right'));
    pick('Fixed value');
    fireEvent.change(screen.getByLabelText('Value (Integer)'), { target: { value: '5' } });
    save();

    expect(savedExpression(onOperation)).toEqual({
      op: 'add',
      left: read('count'),
      right: literal(5),
    });
  });

  it('wraps a loaded node in a unary operation', () => {
    const { onOperation } = renderComputedField({ volume: loaded(read('count'), INTEGER) });

    fireEvent.click(screen.getByRole('button', { name: 'Wrap in an operation' }));
    expect(screen.getByText('Wrap Count in')).toBeInTheDocument();
    pick('Negative of');
    save();

    expect(savedExpression(onOperation)).toEqual({ op: 'negate', value: read('count') });
  });

  it('builds a conditional with a yes-or-no condition and both branches', () => {
    const { onOperation } = renderComputedField({ volume: INTEGER });

    pick('If');
    expect(screen.getByText(/Needs Yes or no/u)).toBeInTheDocument();
    pick('Field');
    fireEvent.click(outlineRow('expression.then'));
    pick('Fixed value');
    fireEvent.change(screen.getByLabelText('Value (Integer)'), { target: { value: '1' } });
    fireEvent.click(outlineRow('expression.else'));
    pick('Fixed value');
    save();

    expect(savedExpression(onOperation)).toEqual({
      op: 'if',
      condition: read('fragile'),
      [THEN]: literal(1),
      [ELSE]: literal(0),
    });
  });

  it('orders, grows and shrinks the inputs of first available', () => {
    const { onOperation } = renderComputedField({ volume: INTEGER });

    pick('First available');
    pick('Field');
    fireEvent.click(outlineRow('expression.values.1'));
    pick('Fixed value');
    fireEvent.click(outlineRow('expression'));
    expect(screen.getByRole('button', { name: 'Remove Input 1' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add input' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Input 3 up' }));
    expect(screen.getByRole('button', { name: 'Save field' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Input 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Input 2 up' }));
    save();

    expect(savedExpression(onOperation)).toEqual({
      op: 'coalesce',
      values: [literal(0), read('count')],
    });
  });

  it('joins text and hides operations that return another type', () => {
    const { onOperation } = renderComputedField({ volume: TEXT });

    expect(screen.queryByRole('button', { name: 'Multiply' })).not.toBeInTheDocument();
    expect(screen.getByText(/operations return another type/u)).toBeInTheDocument();
    pick('Join text');
    pick('Field');
    fireEvent.click(outlineRow('expression.right'));
    pick('Fixed value');
    fireEvent.change(screen.getByLabelText('Value (Short text)'), { target: { value: ' ' } });
    expect(screen.getByText('One space, kept exactly as typed.')).toBeInTheDocument();
    save();

    expect(savedExpression(onOperation)).toEqual({
      op: 'concat',
      left: read('label'),
      right: literal(' '),
    });
  });

  it('compares a choice by option, negates a flag and switches the joining operation', async () => {
    const { onOperation } = renderComputedField({ volume: BOOLEAN });

    pick('Or');
    pick('Equals');
    pick('Field');
    await chooseOption(screen.getByLabelText('Field on Storage box'), 'Condition');
    fireEvent.click(outlineRow('expression.left.right'));
    pick('Fixed value');
    await chooseOption(screen.getByLabelText('Value (Choice)'), 'Worn');
    fireEvent.click(outlineRow('expression.right'));
    pick('Not');
    pick('Field');
    fireEvent.click(outlineRow('expression'));
    await chooseOption(screen.getByLabelText('Operation'), 'and And');
    save();

    expect(savedExpression(onOperation)).toEqual({
      op: 'and',
      left: { op: 'equal', left: read('condition'), right: literal({ optionId: 'opt-worn' }) },
      right: { op: 'not', value: read('fragile') },
    });
  });
});

describe('reads through references', () => {
  it('follows two references, stops at the traversal limit and unwinds', () => {
    const { onOperation } = renderComputedField({ volume: TEXT });

    pick('Field');
    fireEvent.click(screen.getByRole('button', { name: 'Follow a reference' }));
    const references = screen.getByRole('list', { name: 'References to follow' });
    expect(within(references).getByRole('button', { name: /Stored with/u })).toBeDisabled();
    expect(within(references).getByText('Cannot follow: holds many items')).toBeInTheDocument();
    fireEvent.click(within(references).getByRole('button', { name: /Part of/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Follow a reference' }));
    fireEvent.click(screen.getByRole('button', { name: /Stored in/u }));
    expect(screen.getByText('2 of 2 references followed', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Follow a reference' }));
    expect(screen.getByText('Reads stop at two references')).toBeInTheDocument();
    save();
    expect(savedExpression(onOperation)).toEqual(read('code', 'part_of', 'stored_in'));

    fireEvent.click(screen.getByRole('button', { name: 'Stop following Stored in' }));
    save();
    expect(savedExpression(onOperation)).toEqual(read('shelf', 'part_of'));
  });
});

describe('editing a loaded expression', () => {
  const product: WireExpression = { op: 'multiply', left: read('width'), right: read('height') };

  it('reads it back, counts it against the bounds and saves it unchanged', () => {
    const guarded: WireExpression = {
      op: 'if',
      condition: { op: 'less_than', left: read('count'), right: literal(1) },
      [THEN]: literal('0'),
      [ELSE]: { op: 'multiply', left: read('price', 'part_of'), right: read('count') },
    };
    const { onOperation } = renderComputedField({ volume: loaded(guarded, { kind: 'decimal' }) });

    expect(screen.getByTestId('expression-readback')).toHaveTextContent(
      'if Count < 1 then 0 otherwise Part of › Price × Count'
    );
    expect(screen.getByLabelText('Expression size')).toHaveTextContent(
      '8 of 128 nodes · 3 of 32 fields · 1 of 2 hops'
    );
    save();

    expect(savedExpression(onOperation)).toEqual(guarded);
  });

  it('replaces a node, and refuses to save once a node is removed', () => {
    const { onOperation } = renderComputedField({ volume: loaded(product) });

    fireEvent.click(outlineRow('expression.right'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace node' }));
    pick('Fixed value');
    save();
    expect(savedExpression(onOperation)).toEqual({
      op: 'multiply',
      left: read('width'),
      right: literal('0'),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove node' }));
    expect(screen.getByLabelText('Expression size')).toHaveTextContent('1 empty slot');
    expect(screen.getByRole('button', { name: 'Save field' })).toBeDisabled();
  });

  it('saves the override policy the author picks', () => {
    const { onOperation } = renderComputedField({
      volume: loaded(product, { allowOverride: true }),
      environment: { publishedField: undefined },
    });

    fireEvent.click(screen.getByLabelText('Always calculated'));
    save();

    expect(onOperation).toHaveBeenLastCalledWith(expect.objectContaining({ allowOverride: false }));
  });

  it('warns when turning off overrides the published revision allows', () => {
    const published = catalogueTypes({ allowOverride: true })[0]?.fields.find(
      (candidate) => candidate.id === 'volume'
    );
    renderComputedField({
      volume: loaded(product, { allowOverride: true }),
      environment: { publishedField: published, publishedRevision: 3 },
    });

    fireEvent.click(screen.getByLabelText('Always calculated'));

    expect(screen.getByText(/Published revision 3 allows them/u)).toBeInTheDocument();
  });
});
