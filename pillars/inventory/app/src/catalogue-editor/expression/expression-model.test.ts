import { describe, expect, it } from 'vitest';

import { catalogueTypes } from '../computed/test-utils';
import { isFollowable, readLabel, resolveRead } from './catalogue-lookup';
import {
  addCoalesceInput,
  clearAt,
  EMPTY,
  moveCoalesceInput,
  removeCoalesceInput,
  replaceAt,
  switchBinaryOp,
  updateAt,
  wrapAt,
} from './edit';
import { formatLiteral, formula, staticDependencies } from './formula';
import { OPERATIONS, operationBlockedReason } from './operations';
import { fieldFitsSlot, slotTypes } from './slot-types';
import {
  expressionStats,
  issueBelongsTo,
  issueNodePath,
  nodeAt,
  outlineRows,
  parentPath,
} from './tree';
import { expressionContext, fromWire, toWire } from './wire';

import type { ExpressionNode, ReadNode } from './model';
import type { OperationInfo } from './operations';

const context = expressionContext(catalogueTypes(), 'box', 'volume');

function read(fieldId: string, ...path: string[]): ReadNode {
  return { op: 'read', path, fieldId };
}

const guarded: ExpressionNode = {
  op: 'if',
  condition: { op: 'less_than', left: read('count'), right: { op: 'literal', value: 1 } },
  thenBranch: { op: 'literal', value: '0' },
  elseBranch: { op: 'multiply', left: read('price', 'part_of'), right: read('count') },
};

const fallback: ExpressionNode = {
  op: 'coalesce',
  values: [
    read('price', 'part_of'),
    { op: 'multiply', left: read('width'), right: read('height') },
  ],
};

const worn: ExpressionNode = {
  op: 'or',
  left: {
    op: 'equal',
    left: read('condition'),
    right: { op: 'literal', value: { optionId: 'opt-worn' } },
  },
  right: { op: 'and', left: read('fragile'), right: { op: 'not', value: read('fragile') } },
};

function info(op: OperationInfo['op']): OperationInfo {
  const found = OPERATIONS.find((candidate) => candidate.op === op);
  if (found === undefined) throw new Error(op);
  return found;
}

describe('outline paths', () => {
  it('addresses nodes with the server issue path grammar', () => {
    expect(outlineRows(guarded).map((row) => row.path)).toEqual([
      'expression',
      'expression.condition',
      'expression.condition.left',
      'expression.condition.right',
      'expression.then',
      'expression.else',
      'expression.else.left',
      'expression.else.right',
    ]);
    expect(outlineRows(fallback).map((row) => row.path)).toContain('expression.values.1.left');
    expect(outlineRows(worn).map((row) => row.path)).toContain('expression.right.right.value');
  });

  it('finds a node by path and nothing for a path that names none', () => {
    expect(nodeAt(fallback, 'expression.values.0')).toEqual(read('price', 'part_of'));
    expect(nodeAt(fallback, 'expression.values.2')).toBeUndefined();
  });

  it('walks up one node, treating a coalesce input as one step', () => {
    expect(parentPath('expression.values.1.left')).toBe('expression.values.1');
    expect(parentPath('expression.values.1')).toBe('expression');
    expect(parentPath('expression.right.right.value')).toBe('expression.right.right');
    expect(parentPath('expression')).toBe('expression');
  });

  it('lands an issue on the node that owns it, and anything unplaced on the root', () => {
    expect(issueBelongsTo('expression.left.fieldId', 'expression.left')).toBe(true);
    expect(issueBelongsTo('expression.left.path.1', 'expression.left')).toBe(true);
    expect(issueBelongsTo('expression.left.right', 'expression.left')).toBe(false);
    expect(issueNodePath(guarded, 'expression.else.left.path.0')).toBe('expression.else.left');
    expect(issueNodePath(guarded, 'expression.else.right')).toBe('expression.else.right');
    expect(issueNodePath(fallback, 'expression.values.1.op')).toBe('expression.values.1');
    expect(issueNodePath(guarded, 'expression.nowhere.at.all')).toBe('expression');
  });
});

describe('expression stats', () => {
  it('counts empty slots apart from placed nodes and finds the deepest read', () => {
    const half: ExpressionNode = { op: 'concat', left: read('label'), right: EMPTY };
    expect(expressionStats(half)).toEqual({ nodes: 2, emptySlots: 1, deepestHops: 0 });
    expect(expressionStats(read('code', 'part_of', 'stored_in')).deepestHops).toBe(2);
  });
});

describe('formula readback', () => {
  it('reads nested nodes, references, coalesce inputs and conditions', () => {
    expect(formula(context, guarded)).toBe('if Count < 1 then 0 otherwise Part of › Price × Count');
    expect(formula(context, fallback)).toBe('first available(Part of › Price, Width × Height)');
    expect(formatLiteral(' ')).toBe('“ ”');
  });

  it('names a compared choice by its option label', () => {
    expect(formula(context, worn)).toContain('Condition = Worn');
  });

  it('still labels a read whose field the catalogue no longer has', () => {
    expect(readLabel(context, read('gone', 'part_of'))).toBe('Part of › Unknown field');
    expect(resolveRead(context, read('price', 'missing_ref')).field).toBeUndefined();
  });
});

describe('static dependencies', () => {
  it('counts each followed reference as well as the field it reaches, once', () => {
    expect(staticDependencies(context, fallback).map((dependency) => dependency.key)).toEqual([
      'Storage box:part_of',
      'Part:price',
      'Storage box:width',
      'Storage box:height',
    ]);
    expect(staticDependencies(context, guarded)).toHaveLength(3);
  });
});

describe('slot types', () => {
  it('lets a product of measurements take any number, for derived units', () => {
    const product: ExpressionNode = {
      op: 'multiply',
      left: { op: 'multiply', left: read('width'), right: read('height') },
      right: EMPTY,
    };
    const types = slotTypes(context, product, { kind: 'measurement', unit: 'cm³' });
    expect(types.get('expression')).toEqual({ kind: 'measurement', unit: 'cm³' });
    expect(types.get('expression.left')).toEqual({ kind: 'number' });
    expect(types.get('expression.left.right')).toEqual({ kind: 'number' });
    expect(types.get('expression.right')).toEqual({ kind: 'number' });
  });

  it('keeps sums in the field type and types comparisons from a field or value', () => {
    const types = slotTypes(context, guarded, { kind: 'decimal' });
    expect(types.get('expression.condition')).toEqual({ kind: 'boolean' });
    expect(types.get('expression.condition.left')).toEqual({ kind: 'integer' });
    expect(types.get('expression.then')).toEqual({ kind: 'decimal' });
    const inputs = slotTypes(context, fallback, { kind: 'decimal' });
    expect(inputs.get('expression.values.0')).toEqual({ kind: 'decimal' });
  });

  it('fits fields by kind and unit, any number to a factor, and never many values', () => {
    const width = { kind: 'measurement', unit: 'cm', cardinality: 'one' } as const;
    expect(fieldFitsSlot(width, { kind: 'number' })).toBe(true);
    expect(fieldFitsSlot(width, { kind: 'measurement', unit: 'cm³' })).toBe(false);
    expect(fieldFitsSlot({ kind: 'short_text', cardinality: 'one' }, { kind: 'number' })).toBe(
      false
    );
    expect(fieldFitsSlot({ kind: 'integer', cardinality: 'many' }, undefined)).toBe(false);
  });
});

describe('palette rules', () => {
  it('keeps operations out of slots whose type they cannot return', () => {
    expect(operationBlockedReason(info('concat'), { kind: 'decimal' })).toBe(
      'Returns text; this slot needs Decimal'
    );
    expect(operationBlockedReason(info('multiply'), { kind: 'boolean' })).not.toBeNull();
    expect(operationBlockedReason(info('less_than'), { kind: 'short_text' })).not.toBeNull();
    expect(operationBlockedReason(info('add'), { kind: 'number' })).toBeNull();
  });

  it('offers type-preserving operations in any slot', () => {
    for (const op of ['read', 'literal', 'if', 'coalesce'] as const)
      expect(operationBlockedReason(info(op), { kind: 'date' })).toBeNull();
  });
});

describe('tree edits', () => {
  it('replaces, clears and switches nodes by issue path', () => {
    const replaced = replaceAt(guarded, 'expression.else.right', { op: 'literal', value: 2 });
    expect(nodeAt(replaced, 'expression.else.right')).toEqual({ op: 'literal', value: 2 });
    expect(nodeAt(replaced, 'expression.else.left')).toEqual(read('price', 'part_of'));
    expect(clearAt(guarded, 'expression')).toEqual(EMPTY);
    expect(
      nodeAt(switchBinaryOp(guarded, 'expression.else', 'add'), 'expression.else')
    ).toMatchObject({ op: 'add' });
    expect(updateAt(guarded, 'expression.else.nowhere', () => EMPTY)).toEqual(guarded);
  });

  it('wraps a node as the first input, or as Then of If', () => {
    const node = read('count');
    expect(wrapAt(node, 'expression', 'negate')).toEqual({ op: 'negate', value: node });
    expect(wrapAt(node, 'expression', 'add')).toEqual({ op: 'add', left: node, right: EMPTY });
    expect(wrapAt(node, 'expression', 'if')).toEqual({
      op: 'if',
      condition: EMPTY,
      thenBranch: node,
      elseBranch: EMPTY,
    });
    expect(wrapAt(node, 'expression', 'coalesce')).toEqual({
      op: 'coalesce',
      values: [node, EMPTY],
    });
  });

  it('grows, reorders and shrinks coalesce inputs, never below two', () => {
    const three = addCoalesceInput(fallback, 'expression');
    expect(three).toMatchObject({ values: [read('price', 'part_of'), expect.anything(), EMPTY] });
    const moved = moveCoalesceInput(three, 'expression', 2, -1);
    expect(nodeAt(moved, 'expression.values.1')).toEqual(EMPTY);
    expect(moveCoalesceInput(three, 'expression', 0, -1)).toEqual(three);
    expect(removeCoalesceInput(three, 'expression', 2)).toEqual(fallback);
    expect(removeCoalesceInput(fallback, 'expression', 0)).toEqual(fallback);
  });
});

describe('wire form', () => {
  it('sends nothing while any slot is empty', () => {
    expect(toWire({ op: 'add', left: read('count'), right: EMPTY })).toBeNull();
    expect(toWire({ op: 'coalesce', values: [read('count'), EMPTY] })).toBeNull();
  });

  it('writes if branches as then and else, and reads them back unchanged', () => {
    const wire = toWire(guarded);
    expect(wire).toHaveProperty('then', { op: 'literal', value: '0' });
    expect(wire).toHaveProperty('else.op', 'multiply');
    expect(wire).not.toHaveProperty('thenBranch');
    expect(fromWire(wire)).toEqual(guarded);
    expect(fromWire(toWire(fallback))).toEqual(fallback);
    expect(fromWire(toWire(worn))).toEqual(worn);
  });

  it('loads anything unrecognised as an empty slot', () => {
    expect(fromWire(null)).toEqual(EMPTY);
    expect(fromWire('multiply')).toEqual(EMPTY);
  });
});

describe('followable references', () => {
  it('follows only one-cardinality references to items', () => {
    const box = context.types.find((type) => type.id === 'box');
    const byId = (id: string) => box?.fields.find((field) => field.id === id);
    const partOf = byId('part_of');
    const storedWith = byId('stored_with');
    const tags = byId('tags');
    if (partOf === undefined || storedWith === undefined || tags === undefined)
      throw new Error('fixture');
    expect(isFollowable(partOf)).toBe(true);
    expect(isFollowable(storedWith)).toBe(false);
    expect(isFollowable(tags)).toBe(false);
  });
});
