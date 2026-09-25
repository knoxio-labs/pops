import { describe, expect, it } from 'vitest';

import { BLANK_DRAFT } from './paste-parser';
import { isBlank, rowIssues, settle, validateRows } from './row-validation';

import type { BulkDraft } from './paste-parser';
import type { BulkContext } from './row-validation';

const context: BulkContext = {
  types: [
    { id: 't-kitchen', label: 'Kitchenware', containment: false },
    { id: 't-box', label: 'Moving box', containment: true },
  ],
  codes: new Map([['K12', 'Kitchen 12']]),
  resolvesWhere: (text) => ['kitchen', 'kitchen 12'].includes(text.toLowerCase()),
};

const row = (patch: Partial<BulkDraft>): BulkDraft => ({ ...BLANK_DRAFT, ...patch });
const messages = (rows: BulkDraft[], index = 0) =>
  rowIssues(rows, index, context).map((issue) => `${issue.column}: ${issue.message}`);

describe('rowIssues', () => {
  it('accepts a row with only a name', () => {
    expect(messages([row({ name: 'Kettle' })])).toEqual([]);
  });

  it('ignores a blank row but flags a row with no name', () => {
    expect(isBlank(row({ name: '  ' }))).toBe(true);
    expect(messages([row({})])).toEqual([]);
    expect(messages([row({ note: 'x' })])).toEqual(['name: Name is required.']);
  });

  it('matches types by label ignoring case, and names an unknown one', () => {
    expect(messages([row({ name: 'Pan', type: 'kitchenware' })])).toEqual([]);
    expect(messages([row({ name: 'Pan', type: 'Cookware' })])).toEqual([
      'type: No type is called Cookware. Leave it blank to file the item untyped.',
    ]);
  });

  it('wants a whole quantity of at least 1, and 1 for a container', () => {
    for (const quantity of ['0', '-2', '1.5', 'two']) {
      expect(messages([row({ name: 'A', quantity })])).toEqual([
        'quantity: Quantity is a whole number, 1 or more.',
      ]);
    }
    expect(messages([row({ name: 'Box', type: 'Moving box', quantity: '2' })])).toEqual([
      'quantity: A Moving box is a container, so its quantity is 1.',
    ]);
    expect(messages([row({ name: 'Box', type: 'Moving box', quantity: '1' })])).toEqual([]);
  });

  it('refuses a code already in use, or used twice in the grid', () => {
    expect(messages([row({ name: 'A', code: 'k12' })])).toEqual([
      'code: Code K12 is already on Kitchen 12.',
    ]);
    const twice = [row({ name: 'A', code: 'Z1' }), row({ name: 'B', code: 'z1' })];
    expect(messages(twice, 1)).toEqual(['code: Code Z1 is also on row 1.']);
    expect(messages(twice, 0)).toEqual(['code: Code Z1 is also on row 2.']);
  });

  it('needs a destination that resolves', () => {
    expect(messages([row({ name: 'A', where: 'Kitchen 12' })])).toEqual([]);
    expect(messages([row({ name: 'A', where: 'Attic' })])).toEqual([
      'where: No place or container is called Attic.',
    ]);
  });
});

describe('settle', () => {
  it('creates valid rows, keeps invalid ones and drops blanks', () => {
    const rows = [
      row({ name: 'Kettle' }),
      row({}),
      row({ name: 'Box', type: 'Moving box', quantity: '3' }),
      row({ name: 'Mugs', quantity: '6' }),
    ];
    const result = settle(rows, context);
    expect(result.created.map((draft) => draft.name)).toEqual(['Kettle', 'Mugs']);
    expect(result.remaining.map((draft) => draft.name)).toEqual(['Box']);
    expect(result.remainingIssues).toEqual([
      { row: 0, column: 'quantity', message: 'A Moving box is a container, so its quantity is 1.' },
    ]);
  });

  it('checks what remains against codes the created rows now hold', () => {
    const rows = [
      row({ name: 'Lamp', code: 'L1' }),
      row({ name: 'Lamp 2', code: 'L1', where: 'Attic' }),
    ];
    expect(validateRows(rows, context).filter((issue) => issue.row === 0)).toHaveLength(1);
    const both = settle(rows, context);
    expect(both.created).toEqual([]);
    expect(both.remainingIssues.map((issue) => issue.message)).toEqual([
      'Code L1 is also on row 2.',
      'Code L1 is also on row 1.',
      'No place or container is called Attic.',
    ]);
    const fixedFirst = settle(
      [
        row({ name: 'Lamp', code: 'L2' }),
        row({ name: 'Lamp 2', code: 'l2', where: 'Kitchen' }),
        row({ name: 'Pot', where: 'Attic' }),
      ],
      context
    );
    expect(fixedFirst.remaining).toHaveLength(3);
  });

  it('words what remains against the grid as it stands after the submit', () => {
    const rows = [
      row({ name: 'Pot', where: 'Attic' }),
      row({ name: 'Kettle' }),
      row({ name: 'Lamp', code: 'L5' }),
      row({ name: 'Lamp 2', code: 'L5' }),
    ];
    expect(validateRows(rows, context).find((issue) => issue.row === 3)?.message).toBe(
      'Code L5 is also on row 3.'
    );
    const result = settle(rows, context);
    expect(result.created.map((draft) => draft.name)).toEqual(['Kettle']);
    expect(result.remainingIssues.filter((issue) => issue.column === 'code')).toEqual([
      { row: 1, column: 'code', message: 'Code L5 is also on row 3.' },
      { row: 2, column: 'code', message: 'Code L5 is also on row 2.' },
    ]);
  });
});
