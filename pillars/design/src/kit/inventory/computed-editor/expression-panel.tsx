import { Braces } from 'lucide-react';

import { cn } from '@pops/ui';

import { ExpressionOutline } from './expression-outline';
import { formula, staticDependencies } from './formula';
import { EXPRESSION_LIMITS } from './model';
import { expressionStats } from './tree';

import type { ExpressionContext, ExpressionNode } from './model';
import type { ExpressionIssue } from './scenario';

function Limits({
  context,
  expression,
}: {
  context: ExpressionContext;
  expression: ExpressionNode;
}) {
  const stats = expressionStats(expression);
  const dependencies = staticDependencies(context, expression).length;
  const overDependencies = dependencies > EXPRESSION_LIMITS.dependencies;
  return (
    <p className="border-t pt-2 text-xs text-muted-foreground">
      {stats.nodes} of {EXPRESSION_LIMITS.nodes} nodes ·{' '}
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
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center">
      <Braces className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium">No expression yet</p>
      <p className="text-xs text-muted-foreground">
        Start with a field, a fixed value or an operation. Only what fits this field is offered.
      </p>
    </div>
  );
}

/**
 * The left column: the expression read back as one line, the outline of its
 * nodes, and how close it sits to the server's size bounds.
 */
export function ExpressionPanel({
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
  const empty = expression.op === 'empty';
  const readback = empty ? '' : formula(context, expression);
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3" aria-label="Expression">
      <div>
        <h4 className="text-sm font-semibold">Expression</h4>
        {!empty && (
          <p
            title={readback}
            className="mt-1 line-clamp-2 break-words font-mono text-xs text-muted-foreground"
          >
            {readback}
          </p>
        )}
      </div>
      {empty ? (
        <EmptyExpression />
      ) : (
        <ExpressionOutline
          context={context}
          expression={expression}
          selectedPath={selectedPath}
          issues={issues}
          onSelect={onSelect}
        />
      )}
      <Limits context={context} expression={expression} />
    </section>
  );
}
