import {
  electronicsContext,
  electronicsType,
  storageBoxContext,
} from '@/fixtures/inventory-computed-catalogue';
import {
  boxVolume,
  boxVolumeInProgress,
  displayNameInProgress,
  insuredValue,
  needsAttention,
  perUnitSaving,
  replacementValue,
  shelfLabel,
} from '@/fixtures/inventory-computed-expressions';
import { describe, expect, it } from 'vitest';

import { findField, isFollowable } from './catalogue-lookup';
import { formatLiteral, formula, staticDependencies } from './formula';
import { OPERATIONS, operationBlockedReason } from './operations';
import { slotTypes } from './slot-types';
import { expressionStats, issueBelongsTo, nodeAt, outlineRows, parentPath } from './tree';

import type { OperationInfo } from './operations';

function info(op: OperationInfo['op']): OperationInfo {
  const found = OPERATIONS.find((candidate) => candidate.op === op);
  if (found === undefined) throw new Error(op);
  return found;
}

describe('outline paths', () => {
  it('addresses nodes with the server issue path grammar', () => {
    expect(outlineRows(insuredValue).map((row) => row.path)).toEqual([
      'expression',
      'expression.condition',
      'expression.condition.left',
      'expression.condition.right',
      'expression.then',
      'expression.else',
      'expression.else.left',
      'expression.else.right',
    ]);
    expect(outlineRows(replacementValue).map((row) => row.path)).toContain(
      'expression.args.1.left'
    );
    expect(outlineRows(needsAttention).map((row) => row.path)).toContain(
      'expression.right.right.value'
    );
  });

  it('finds a node by path and nothing for a path that names none', () => {
    expect(nodeAt(replacementValue, 'expression.args.0')).toEqual({
      op: 'read',
      path: ['part_of'],
      fieldId: 'replacement_quote',
    });
    expect(nodeAt(replacementValue, 'expression.args.2')).toBeUndefined();
  });

  it('walks up one node, treating a coalesce input as one step', () => {
    expect(parentPath('expression.args.1.left')).toBe('expression.args.1');
    expect(parentPath('expression.args.1')).toBe('expression');
    expect(parentPath('expression.right.right.value')).toBe('expression.right.right');
    expect(parentPath('expression')).toBe('expression');
  });

  it('lands a read part issue on the read and nowhere else', () => {
    expect(issueBelongsTo('expression.left.fieldId', 'expression.left')).toBe(true);
    expect(issueBelongsTo('expression.left.path.1', 'expression.left')).toBe(true);
    expect(issueBelongsTo('expression.left', 'expression.left')).toBe(true);
    expect(issueBelongsTo('expression.left.right', 'expression.left')).toBe(false);
    expect(issueBelongsTo('expression.left.fieldId', 'expression')).toBe(false);
  });
});

describe('expression stats', () => {
  it('counts empty slots apart from placed nodes', () => {
    expect(expressionStats(displayNameInProgress)).toEqual({
      nodes: 2,
      emptySlots: 1,
      deepestHops: 0,
    });
  });

  it('reports the deepest read path', () => {
    expect(expressionStats(shelfLabel).deepestHops).toBe(2);
    expect(expressionStats(replacementValue).deepestHops).toBe(1);
  });
});

describe('formula readback', () => {
  it('brackets a nested binary and reads references as a path', () => {
    expect(formula(electronicsContext, perUnitSaving)).toBe(
      'Unit price − (Part of › Replacement quote ÷ Package count)'
    );
  });

  it('reads coalesce inputs in order', () => {
    expect(formula(electronicsContext, replacementValue)).toBe(
      'first available(Part of › Replacement quote, Unit price × Package count)'
    );
  });

  it('shows a decimal literal bare and a text literal quoted', () => {
    expect(formula(electronicsContext, insuredValue)).toBe(
      'if Package count < 1 then 0 otherwise Unit price × Package count'
    );
    expect(formatLiteral(' ')).toBe('“ ”');
  });

  it('names a compared choice literal by its option label', () => {
    expect(formula(electronicsContext, needsAttention)).toContain('Condition = Worn');
  });
});

describe('static dependencies', () => {
  it('counts each followed reference as well as the field it reaches', () => {
    const keys = staticDependencies(electronicsContext, replacementValue).map((dep) => dep.key);
    expect(keys).toEqual([
      'Electronics:part_of',
      'Bundle:replacement_quote',
      'Electronics:unit_price',
      'Electronics:package_count',
    ]);
  });

  it('counts a field read twice once', () => {
    expect(staticDependencies(electronicsContext, insuredValue)).toHaveLength(2);
  });
});

describe('slot types', () => {
  it('guesses the field unit on the left and a plain decimal on the right before anything is placed', () => {
    const empty = { op: 'multiply', left: { op: 'empty' }, right: { op: 'empty' } } as const;
    const types = slotTypes(storageBoxContext, empty, { kind: 'measurement', unit: 'cm' });
    expect(types.get('expression.left')).toEqual({ kind: 'measurement', unit: 'cm' });
    expect(types.get('expression.right')).toEqual({ kind: 'decimal' });
  });

  it('opens the right side to a decimal or any measurement once the left is one', () => {
    const scaled = {
      op: 'multiply',
      left: { op: 'read', path: [], fieldId: 'width' },
      right: { op: 'literal', value: 2 },
    } as const;
    const types = slotTypes(storageBoxContext, scaled, { kind: 'measurement', unit: 'cm' });
    expect(types.get('expression.left')).toEqual({ kind: 'measurement', unit: 'cm' });
    expect(types.get('expression.right')).toEqual({ kind: 'measurement' });
  });

  it('derives cm² then cm³ for a chain of measurement products (ADR-002 D5)', () => {
    const types = slotTypes(storageBoxContext, boxVolume, { kind: 'measurement', unit: 'L' });
    expect(types.get('expression.left')).toEqual({ kind: 'measurement', unit: 'cm²' });
    expect(types.get('expression.left.left')).toEqual({ kind: 'measurement', unit: 'cm' });
    expect(types.get('expression.left.right')).toEqual({ kind: 'measurement', unit: 'cm' });
    expect(types.get('expression.right')).toEqual({ kind: 'measurement', unit: 'cm' });
  });

  it('leaves an empty slot open to a decimal or any measurement while its partner is one', () => {
    const types = slotTypes(storageBoxContext, boxVolumeInProgress, {
      kind: 'measurement',
      unit: 'L',
    });
    expect(types.get('expression.right')).toEqual({ kind: 'measurement' });
  });

  it('types a comparison from its left operand and its result as yes or no', () => {
    const types = slotTypes(electronicsContext, insuredValue, { kind: 'decimal' });
    expect(types.get('expression.condition')).toEqual({ kind: 'boolean' });
    expect(types.get('expression.condition.right')).toEqual({ kind: 'integer' });
    expect(types.get('expression.then')).toEqual({ kind: 'decimal' });
  });
});

describe('palette rules', () => {
  it('keeps operations out of slots whose type they cannot return', () => {
    expect(operationBlockedReason(info('concat'), { kind: 'decimal' })).toBe(
      'Returns text; this slot needs Decimal'
    );
    expect(operationBlockedReason(info('multiply'), { kind: 'boolean' })).not.toBeNull();
    expect(operationBlockedReason(info('less_than'), { kind: 'short_text' })).not.toBeNull();
  });

  it('offers type-preserving operations in any slot', () => {
    for (const op of ['read', 'literal', 'if', 'coalesce'] as const)
      expect(operationBlockedReason(info(op), { kind: 'date' })).toBeNull();
    expect(operationBlockedReason(info('negate'), { kind: 'measurement', unit: 'cm' })).toBeNull();
  });
});

describe('followable references', () => {
  it('follows only one-cardinality references to items', () => {
    expect(isFollowable(findField(electronicsType, 'part_of'))).toBe(true);
    expect(isFollowable(findField(electronicsType, 'replaces'))).toBe(true);
    expect(isFollowable(findField(electronicsType, 'stored_with'))).toBe(false);
    expect(isFollowable(findField(electronicsType, 'accessories'))).toBe(false);
    expect(isFollowable(findField(electronicsType, 'unit_price'))).toBe(false);
  });
});
