import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';

import {
  comparedChoiceField,
  valueTypeLabel,
  OPERATIONS,
  operationBlockedReason,
  nodeChildren,
} from '@pops/inventory/expression';
import {
  Button,
  Label,
  SelectContent,
  SelectItem,
  SelectPrimitive,
  SelectTrigger,
  SelectValue,
} from '@pops/ui';

import {
  addCoalesceInput,
  moveCoalesceInput,
  removeCoalesceInput,
  switchBinaryOp,
} from '../expression/edit';
import { useBuilder } from './BuilderContext';
import { SlotRow } from './InspectorParts';
import { nodeTitle } from './node-labels';

import type { BinaryOp, ExpressionNode } from '@pops/inventory/expression';

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

function binaryOp(value: string): BinaryOp | undefined {
  return BINARY_OPS.find((candidate) => candidate === value);
}

/** Swaps a two-input operation for another that fits the same slot, keeping both inputs. */
export function OperationSwitch({ op }: { op: BinaryOp }) {
  const builder = useBuilder();
  const expected = builder.slots.get(builder.selectedPath);
  const options = OPERATIONS.filter(
    (info) =>
      BINARY_OPS.some((candidate) => candidate === info.op) &&
      (expected === undefined || operationBlockedReason(info, expected) === null)
  );
  return (
    <div className="space-y-2">
      <Label htmlFor="expression-operation">Operation</Label>
      <SelectPrimitive
        value={op}
        onValueChange={(value) => {
          const next = binaryOp(value);
          if (next !== undefined)
            builder.change(switchBinaryOp(builder.root, builder.selectedPath, next));
        }}
      >
        <SelectTrigger id="expression-operation" className="min-h-11 w-full">
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
export function InputList({ node }: { node: ExpressionNode }) {
  const { context, slots, selectedPath } = useBuilder();
  return (
    <div className="space-y-2">
      <Label>Inputs</Label>
      <ul className="space-y-1.5">
        {nodeChildren(node).map((child) => (
          <SlotRow
            key={child.segment}
            slot={child.slot}
            path={`${selectedPath}.${child.segment}`}
            title={nodeTitle(context, child.node, comparedChoiceField(context, node))}
            expected={slots.get(`${selectedPath}.${child.segment}`)}
            empty={child.node.op === 'empty'}
          />
        ))}
      </ul>
    </div>
  );
}

function ArgumentControls({ index, count, slot }: { index: number; count: number; slot: string }) {
  const builder = useBuilder();
  const { root, selectedPath } = builder;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-9 min-w-9"
        disabled={index === 0}
        aria-label={`Move ${slot} up`}
        onClick={() => builder.change(moveCoalesceInput(root, selectedPath, index, -1))}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-9 min-w-9"
        disabled={index === count - 1}
        aria-label={`Move ${slot} down`}
        onClick={() => builder.change(moveCoalesceInput(root, selectedPath, index, 1))}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-9 min-w-9"
        disabled={count <= 2}
        aria-label={`Remove ${slot}`}
        onClick={() => builder.change(removeCoalesceInput(root, selectedPath, index))}
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
export function CoalesceInputs({ node }: { node: Extract<ExpressionNode, { op: 'coalesce' }> }) {
  const builder = useBuilder();
  const { context, slots, selectedPath } = builder;
  const inputType = slots.get(selectedPath);
  return (
    <div className="space-y-2">
      <Label>Tried in order</Label>
      <ol className="space-y-1.5">
        {nodeChildren(node).map((child, index) => (
          <SlotRow
            key={child.segment}
            slot={child.slot}
            path={`${selectedPath}.${child.segment}`}
            title={nodeTitle(context, child.node)}
            expected={undefined}
            empty={child.node.op === 'empty'}
          >
            <ArgumentControls index={index} count={node.values.length} slot={child.slot} />
          </SlotRow>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-9"
          onClick={() => builder.change(addCoalesceInput(builder.root, selectedPath))}
        >
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
