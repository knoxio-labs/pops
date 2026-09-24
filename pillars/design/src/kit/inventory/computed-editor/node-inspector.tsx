import {
  ROOT_PATH,
  comparedChoiceField,
  nodeAt,
  operationInfo,
  outlineRows,
  parentPath,
} from '@pops/inventory/expression';

import { nodeTitle } from './expression-outline';
import { CoalesceInputs, InputList, OperationSwitch } from './inspector-branches';
import { LiteralInspector } from './inspector-literal';
import { IssueAlert, NodeHeader } from './inspector-parts';
import { ReadInspector } from './inspector-read';
import { OperationPalette } from './operation-palette';

import type {
  ExpressionContext,
  ExpressionField,
  ExpressionNode,
  OutlineRow,
  SlotType,
} from '@pops/inventory/expression';

import type { ExpressionIssue, InspectorPanel } from './scenario';

type Types = ReadonlyMap<string, SlotType | undefined>;

interface InspectorProps {
  context: ExpressionContext;
  root: ExpressionNode;
  path: string;
  panel: InspectorPanel;
  types: Types;
  issue: ExpressionIssue | undefined;
  followOpen: boolean;
  onPanel: (panel: InspectorPanel) => void;
}

function slotDescription(rows: readonly OutlineRow[], row: OutlineRow): string {
  if (row.path === ROOT_PATH) return 'Whole expression';
  const parent = rows.find((candidate) => candidate.path === parentPath(row.path));
  if (parent === undefined || parent.node.op === 'empty') return row.slot ?? '';
  return `${row.slot ?? ''} of ${operationInfo(parent.node.op).label}`;
}

function choiceFieldFor(
  context: ExpressionContext,
  rows: readonly OutlineRow[],
  path: string
): ExpressionField | undefined {
  return comparedChoiceField(context, rows.find((row) => row.path === parentPath(path))?.node);
}

function InspectorBody(props: InspectorProps & { row: OutlineRow; rows: readonly OutlineRow[] }) {
  const { context, row, types, path, followOpen } = props;
  const node = row.node;
  const expected = types.get(path);
  if (node.op === 'empty' || props.panel !== 'node') {
    const mode = node.op === 'empty' || props.panel === 'insert' ? 'insert' : 'wrap';
    const target = mode === 'insert' ? slotDescription(props.rows, row) : nodeTitle(context, node);
    return (
      <OperationPalette
        expected={expected}
        mode={mode}
        target={target}
        onClose={node.op === 'empty' ? undefined : () => props.onPanel('node')}
      />
    );
  }
  if (node.op === 'read')
    return (
      <ReadInspector context={context} node={node} expected={expected} followOpen={followOpen} />
    );
  if (node.op === 'literal')
    return (
      <LiteralInspector
        value={node.value}
        expected={expected}
        choiceField={choiceFieldFor(context, props.rows, path)}
      />
    );
  if (node.op === 'coalesce')
    return <CoalesceInputs context={context} node={node} path={path} types={types} />;
  const binary = 'left' in node;
  return (
    <div className="space-y-3">
      {binary && <OperationSwitch op={node.op} expected={expected} />}
      <InputList context={context} node={node} path={path} types={types} />
    </div>
  );
}

/**
 * Edits the selected node. The header names the slot it fills and the type it
 * must return; the body is the control that node's shape needs, or the
 * operation palette while a slot is empty or being wrapped.
 */
export function NodeInspector(props: InspectorProps) {
  const rows = outlineRows(props.root);
  const row = rows.find((candidate) => candidate.path === props.path) ?? rows[0];
  if (row === undefined) return null;
  return (
    <div className="space-y-3">
      {props.panel === 'node' && row.node.op !== 'empty' && (
        <NodeHeader
          symbol={operationInfo(row.node.op).symbol}
          title={nodeTitle(
            props.context,
            row.node,
            comparedChoiceField(props.context, nodeAt(props.root, parentPath(row.path)))
          )}
          slot={slotDescription(rows, row)}
          expected={props.types.get(row.path)}
          isRoot={row.path === ROOT_PATH}
          onPanel={props.onPanel}
        />
      )}
      {props.issue !== undefined && <IssueAlert issue={props.issue} />}
      <InspectorBody {...props} path={row.path} row={row} rows={rows} />
    </div>
  );
}
