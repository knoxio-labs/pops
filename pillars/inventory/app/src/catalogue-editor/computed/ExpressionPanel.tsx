import { AlertCircle, Braces } from 'lucide-react';

import { cn } from '@pops/ui';

import { comparedChoiceField, formula, staticDependencies } from '../expression/formula';
import { EXPRESSION_LIMITS } from '../expression/model';
import {
  expressionStats,
  issueNodePath,
  nodeAt,
  outlineRows,
  parentPath,
} from '../expression/tree';
import { useBuilder } from './BuilderContext';
import { nodeSymbol, nodeTitle } from './node-labels';

import type { OutlineRow } from '../expression/tree';

function Limits() {
  const { context, root } = useBuilder();
  const stats = expressionStats(root);
  const dependencies = staticDependencies(context, root).length;
  const overNodes = stats.nodes > EXPRESSION_LIMITS.nodes;
  const overDependencies = dependencies > EXPRESSION_LIMITS.dependencies;
  return (
    <p className="border-t pt-2 text-xs text-muted-foreground" aria-label="Expression size">
      <span className={cn(overNodes && 'font-medium text-destructive')}>
        {stats.nodes} of {EXPRESSION_LIMITS.nodes} nodes
      </span>{' '}
      ·{' '}
      <span className={cn(overDependencies && 'font-medium text-destructive')}>
        {dependencies} of {EXPRESSION_LIMITS.dependencies} fields
      </span>{' '}
      · {stats.deepestHops} of {EXPRESSION_LIMITS.hops} hops
      {stats.emptySlots > 0 &&
        ` · ${stats.emptySlots} empty ${stats.emptySlots === 1 ? 'slot' : 'slots'}`}
    </p>
  );
}

function EmptyExpression() {
  const { select } = useBuilder();
  return (
    <button
      type="button"
      onClick={() => select('expression')}
      className="flex min-h-11 min-w-11 w-full flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center"
    >
      <Braces className="h-5 w-5 text-muted-foreground" />
      <span className="text-sm font-medium">No expression yet</span>
      <span className="text-xs text-muted-foreground">
        Start with a field, a fixed value or an operation. Only what fits this field is offered.
      </span>
    </button>
  );
}

function RowButton({ row }: { row: OutlineRow }) {
  const { context, root, issues, selectedPath, select } = useBuilder();
  const empty = row.node.op === 'empty';
  const selected = row.path === selectedPath;
  const issue = issues.find((candidate) => issueNodePath(root, candidate.path) === row.path);
  const choiceField = comparedChoiceField(context, nodeAt(root, parentPath(row.path)));
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        data-path={row.path}
        onClick={() => select(row.path)}
        style={{ paddingLeft: `${0.5 + row.depth * 1.25}rem` }}
        className={cn(
          'flex min-h-11 min-w-11 w-full items-center gap-2 rounded-md pr-2 text-left text-sm',
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
 * The left column: the expression read back as one line, an indented outline
 * with one row per node (carrying the server's issue paths, so a refusal flags
 * the exact node), and how close it sits to the server's size bounds.
 */
export function ExpressionPanel() {
  const { context, root } = useBuilder();
  const empty = root.op === 'empty';
  const readback = empty ? '' : formula(context, root);
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3" aria-label="Expression">
      <div>
        <h4 className="text-sm font-semibold">Expression</h4>
        {!empty && (
          <p
            title={readback}
            data-testid="expression-readback"
            className="mt-1 line-clamp-2 break-words font-mono text-xs text-muted-foreground"
          >
            {readback}
          </p>
        )}
      </div>
      {empty ? (
        <EmptyExpression />
      ) : (
        <ul className="max-h-80 space-y-0.5 overflow-y-auto" aria-label="Expression outline">
          {outlineRows(root).map((row) => (
            <RowButton key={row.path} row={row} />
          ))}
        </ul>
      )}
      <Limits />
    </section>
  );
}
