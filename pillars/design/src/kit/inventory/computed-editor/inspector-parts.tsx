import { AlertCircle, ArrowRight, Parentheses, Replace, Trash2 } from 'lucide-react';

import { valueTypeLabel } from '@pops/inventory/expression';
import { Alert, AlertDescription, AlertTitle, Badge, Button, cn } from '@pops/ui';

import type { SlotType } from '@pops/inventory/expression';

import type { ExpressionIssue, InspectorPanel } from './scenario';

/** Identity of the selected node, the slot it fills, its type and its node actions. */
export function NodeHeader({
  symbol,
  title,
  slot,
  expected,
  isRoot,
  onPanel,
}: {
  symbol: string;
  title: string;
  slot: string;
  expected: SlotType | undefined;
  isRoot: boolean;
  onPanel: (panel: InspectorPanel) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-7 min-w-9 items-center justify-center rounded border bg-background px-1 font-mono text-sm">
            {symbol}
          </span>
          <h4 className="truncate font-semibold">{title}</h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {slot} ·{' '}
          {expected === undefined
            ? 'type follows its partner'
            : `returns ${valueTypeLabel(expected)}`}
        </p>
      </div>
      <NodeActions isRoot={isRoot} onPanel={onPanel} />
    </div>
  );
}

function NodeActions({
  isRoot,
  onPanel,
}: {
  isRoot: boolean;
  onPanel: (panel: InspectorPanel) => void;
}) {
  return (
    <div className="flex shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Replace node"
        onClick={() => onPanel('insert')}
      >
        <Replace className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Wrap in an operation"
        onClick={() => onPanel('wrap')}
      >
        <Parentheses className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={isRoot ? 'Clear expression' : 'Remove node'}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** A child input summarised as a row; selecting it moves the inspector down the tree. */
export function SlotRow({
  slot,
  title,
  expected,
  empty,
  children,
}: {
  slot: string;
  title: string;
  expected: SlotType | undefined;
  empty: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center gap-2 rounded-md border px-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{slot}</span>
      <button
        type="button"
        className={cn(
          'min-h-9 min-w-0 flex-1 truncate rounded px-1 text-left text-sm hover:bg-muted',
          empty && 'italic text-muted-foreground'
        )}
      >
        {empty ? 'Choose a value' : title}
      </button>
      {expected !== undefined && (
        <Badge variant="outline" className="shrink-0 font-normal">
          {valueTypeLabel(expected)}
        </Badge>
      )}
      {children}
    </li>
  );
}

/** The server's refusal for the selected node, with a cycle drawn as its chain. */
export function IssueAlert({ issue }: { issue: ExpressionIssue }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{issue.title}</AlertTitle>
      <AlertDescription>
        <p>{issue.message}</p>
        {issue.cycle !== undefined && (
          <ol className="mt-2 flex flex-wrap items-center gap-1" aria-label="Cycle">
            {issue.cycle.slice(0, -1).map((step, index) => (
              <li key={step} className="flex items-center gap-1">
                {index > 0 && <ArrowRight className="h-3 w-3" aria-hidden />}
                <Badge variant="outline" className="border-destructive/40 font-normal">
                  {step}
                </Badge>
              </li>
            ))}
            <li className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3" aria-hidden />
              <span>back to {issue.cycle[0]}</span>
            </li>
          </ol>
        )}
      </AlertDescription>
    </Alert>
  );
}
