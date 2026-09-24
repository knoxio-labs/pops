import { operationInfo, issueNodePath, nodeAt } from '@pops/inventory/expression';

import { useBuilder } from './BuilderContext';
import { CoalesceInputs, InputList, OperationSwitch } from './InspectorBranches';
import { IssueAlert, NodeHeader } from './InspectorParts';
import { LiteralInspector } from './LiteralInspector';
import { choiceFieldAt, nodeTitle, slotDescription } from './node-labels';
import { OperationPalette } from './OperationPalette';
import { ReadInspector } from './ReadInspector';

import type { ExpressionNode } from '@pops/inventory/expression';

function InspectorBody({ node }: { node: ExpressionNode }) {
  const { panel } = useBuilder();
  if (node.op === 'empty' || panel === 'insert') return <OperationPalette mode="insert" />;
  if (panel === 'wrap') return <OperationPalette mode="wrap" />;
  if (node.op === 'read') return <ReadInspector node={node} />;
  if (node.op === 'literal') return <LiteralInspector value={node.value} />;
  if (node.op === 'coalesce') return <CoalesceInputs node={node} />;
  return (
    <div className="space-y-3">
      {'left' in node && <OperationSwitch op={node.op} />}
      <InputList node={node} />
    </div>
  );
}

/**
 * Edits the selected node. The header names the slot it fills and the type it
 * must return; the body is the control that node's shape needs, or the
 * operation palette while a slot is empty, being replaced or being wrapped.
 */
export function NodeInspector() {
  const { context, root, selectedPath, slots, issues, panel } = useBuilder();
  const node = nodeAt(root, selectedPath) ?? root;
  const issue = issues.find((candidate) => issueNodePath(root, candidate.path) === selectedPath);
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Selected node">
      {panel === 'node' && node.op !== 'empty' && (
        <NodeHeader
          symbol={operationInfo(node.op).symbol}
          title={nodeTitle(context, node, choiceFieldAt(context, root, selectedPath))}
          slot={slotDescription(root, selectedPath)}
          expected={slots.get(selectedPath)}
        />
      )}
      {issue !== undefined && <IssueAlert issue={issue} />}
      <InspectorBody node={node} />
    </section>
  );
}
