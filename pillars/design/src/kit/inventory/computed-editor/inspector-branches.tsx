import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';

import {
  OPERATIONS,
  comparedChoiceField,
  nodeChildren,
  operationBlockedReason,
  valueTypeLabel,
} from '@pops/app-inventory/design';
import {
  Button,
  Label,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
} from '@pops/ui';

import { nodeTitle } from './expression-outline';
import { SlotRow } from './inspector-parts';

import type {
  BinaryOp,
  ExpressionContext,
  ExpressionNode,
  SlotType,
} from '@pops/app-inventory/design';

type Types = ReadonlyMap<string, SlotType | undefined>;

const BINARY_OPS: readonly BinaryOp[] = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'concat',
  'equal',
  'less_than',
  'and',
  'or',
];

/** Swaps a two-input operation for another that fits the same slot, keeping both inputs. */
export function OperationSwitch({
  op,
  expected,
}: {
  op: BinaryOp;
  expected: SlotType | undefined;
}) {
  const options = OPERATIONS.filter(
    (info) =>
      BINARY_OPS.some((candidate) => candidate === info.op) &&
      (expected === undefined || operationBlockedReason(info, expected) === null)
  );
  return (
    <div className="space-y-2">
      <Label>Operation</Label>
      <SelectPrimitive defaultValue={op}>
        <SelectTrigger className="min-h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((info) => (
            <SelectItem key={info.op} value={info.op}>
              {info.symbol} {info.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive>
      <p className="text-xs text-muted-foreground">Changing it keeps both inputs.</p>
    </div>
  );
}

/** The inputs of a unary, binary or conditional node, each one step down the tree. */
export function InputList({
  context,
  node,
  path,
  types,
}: {
  context: ExpressionContext;
  node: ExpressionNode;
  path: string;
  types: Types;
}) {
  return (
    <div className="space-y-2">
      <Label>Inputs</Label>
      <ul className="space-y-1.5">
        {nodeChildren(node).map((child) => (
          <SlotRow
            key={child.segment}
            slot={child.slot}
            title={nodeTitle(context, child.node, comparedChoiceField(context, node))}
            expected={types.get(`${path}.${child.segment}`)}
            empty={child.node.op === 'empty'}
          />
        ))}
      </ul>
    </div>
  );
}

function ArgumentControls({
  slot,
  first,
  last,
  removable,
}: {
  slot: string;
  first: boolean;
  last: boolean;
  removable: boolean;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-9 min-w-9"
        disabled={first}
        aria-label={`Move ${slot} up`}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-9 min-w-9"
        disabled={last}
        aria-label={`Move ${slot} down`}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-9 min-w-9"
        disabled={!removable}
        aria-label={`Remove ${slot}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </>
  );
}

/**
 * The ordered inputs of `coalesce`. Order is the meaning: the first input with
 * a value wins, so each row can move up or down, and the list can grow.
 */
export function CoalesceInputs({
  context,
  node,
  path,
  types,
}: {
  context: ExpressionContext;
  node: Extract<ExpressionNode, { op: 'coalesce' }>;
  path: string;
  types: Types;
}) {
  const last = node.values.length - 1;
  const inputType = types.get(path);
  return (
    <div className="space-y-2">
      <Label>Tried in order</Label>
      <ol className="space-y-1.5">
        {nodeChildren(node).map((child, index) => (
          <SlotRow
            key={child.segment}
            slot={child.slot}
            title={nodeTitle(context, child.node, comparedChoiceField(context, node))}
            expected={undefined}
            empty={child.node.op === 'empty'}
          >
            <ArgumentControls
              slot={child.slot}
              first={index === 0}
              last={index === last}
              removable={node.values.length > 2}
            />
          </SlotRow>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" className="min-h-9">
          <Plus className="h-4 w-4" />
          Add input
        </Button>
        <p className="text-xs text-muted-foreground">
          {inputType === undefined ? '' : `Every input returns ${valueTypeLabel(inputType)}. `}
          The first with a value wins; if none has one, the result is unavailable.
        </p>
      </div>
    </div>
  );
}
