import { AlertCircle } from 'lucide-react';

import { cn } from '@pops/ui';

import { readLabel } from './catalogue-lookup';
import { comparedChoiceField, formatLiteral } from './formula';
import { operationInfo } from './operations';
import { issueBelongsTo, nodeAt, outlineRows, parentPath } from './tree';

import type { DesignField, ExpressionContext, ExpressionNode } from './model';
import type { ExpressionIssue } from './scenario';
import type { OutlineRow } from './tree';

function nodeSymbol(node: ExpressionNode): string {
  return node.op === 'empty' ? '?' : operationInfo(node.op).symbol;
}

/** The text an outline row shows for its node. */
export function nodeTitle(
  context: ExpressionContext,
  node: ExpressionNode,
  choiceField?: DesignField
): string {
  if (node.op === 'empty') return 'Choose a value';
  if (node.op === 'read') return readLabel(context, node);
  if (node.op === 'literal') return formatLiteral(node.value, choiceField);
  return operationInfo(node.op).label;
}

function RowButton({
  row,
  context,
  selected,
  issue,
  choiceField,
  onSelect,
}: {
  row: OutlineRow;
  choiceField: DesignField | undefined;
  context: ExpressionContext;
  selected: boolean;
  issue: ExpressionIssue | undefined;
  onSelect: (path: string) => void;
}) {
  const empty = row.node.op === 'empty';
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(row.path)}
        style={{ paddingLeft: `${0.5 + row.depth * 1.25}rem` }}
        className={cn(
          'flex min-h-9 w-full items-center gap-2 rounded-md pr-2 text-left text-sm',
          selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
          issue !== undefined && 'text-destructive'
        )}
      >
        <span
          className={cn(
            'flex h-6 min-w-8 shrink-0 items-center justify-center rounded border bg-background px-1 font-mono text-xs',
            empty && 'border-dashed text-muted-foreground'
          )}
        >
          {nodeSymbol(row.node)}
        </span>
        {row.slot !== null && (
          <span className="shrink-0 text-xs text-muted-foreground">{row.slot}</span>
        )}
        <span className={cn('truncate', empty && 'italic text-muted-foreground')}>
          {nodeTitle(context, row.node, choiceField)}
        </span>
        {issue !== undefined && (
          <AlertCircle className="ml-auto h-4 w-4 shrink-0" aria-label={issue.title} />
        )}
      </button>
    </li>
  );
}

/**
 * The expression as an indented outline, one row per node. Selecting a row
 * opens that node in the inspector; rows carry the server's issue paths so a
 * refused save flags the exact node.
 */
export function ExpressionOutline({
  context,
  expression,
  selectedPath,
  issues,
  onSelect,
}: {
  context: ExpressionContext;
  expression: ExpressionNode;
  selectedPath: string;
  issues: readonly ExpressionIssue[];
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="max-h-80 space-y-0.5 overflow-y-auto" aria-label="Expression outline">
      {outlineRows(expression).map((row) => (
        <RowButton
          key={row.path}
          row={row}
          context={context}
          selected={row.path === selectedPath}
          choiceField={comparedChoiceField(context, nodeAt(expression, parentPath(row.path)))}
          issue={issues.find((issue) => issueBelongsTo(issue.path, row.path))}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
