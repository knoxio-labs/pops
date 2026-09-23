import { ChevronRight, X } from 'lucide-react';

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import { valueTypeLabel } from './model';
import { OPERATIONS, operationBlockedReason } from './operations';

import type { ValueType } from './model';
import type { OperationInfo } from './operations';

function OperationButton({ info }: { info: OperationInfo }) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left hover:border-primary hover:bg-primary/5"
    >
      <span className="mt-0.5 flex h-6 min-w-8 items-center justify-center rounded border bg-background px-1 font-mono text-xs">
        {info.symbol}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{info.label}</span>
        <span className="block text-xs text-muted-foreground">{info.hint}</span>
      </span>
    </button>
  );
}

function BlockedOperations({
  blocked,
}: {
  blocked: readonly { info: OperationInfo; reason: string }[];
}) {
  if (blocked.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex min-h-9 items-center gap-1 text-xs text-muted-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
        {blocked.length} operations return another type
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="grid gap-1 pl-5 text-xs text-muted-foreground sm:grid-cols-2">
          {blocked.map(({ info, reason }) => (
            <li key={info.op}>
              <span className="font-medium text-foreground">{info.label}</span>: {reason}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Picks what fills an empty slot, or what wraps the selected node. Only the
 * operations the slot can take are offered; the rest are disclosed with the
 * reason, so the grammar stays learnable without lengthening the panel.
 */
export function OperationPalette({
  expected,
  mode,
  target,
  onClose,
}: {
  expected: ValueType | undefined;
  mode: 'insert' | 'wrap';
  target: string;
  onClose?: () => void;
}) {
  const candidates = OPERATIONS.filter(
    (info) => mode === 'insert' || (info.op !== 'read' && info.op !== 'literal')
  );
  const reasons = candidates.map((info) => ({
    info,
    reason: expected === undefined ? null : operationBlockedReason(info, expected),
  }));
  const blocked = reasons.flatMap(({ info, reason }) =>
    reason === null ? [] : [{ info, reason }]
  );
  return (
    <section className="space-y-3" aria-label="Choose an operation">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">
            {mode === 'insert' ? 'Choose a value' : `Wrap ${target} in`}
          </h4>
          <p className="text-xs text-muted-foreground">
            {mode === 'insert' && `${target} · `}
            {expected === undefined
              ? 'Any type. The other side of the comparison follows it.'
              : `Needs ${valueTypeLabel(expected)}.`}
            {mode === 'wrap' && ` ${target} moves inside it, as the first input or as Then of If.`}
          </p>
        </div>
        {onClose !== undefined && (
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {reasons
          .filter(({ reason }) => reason === null)
          .map(({ info }) => (
            <OperationButton key={info.op} info={info} />
          ))}
      </div>
      <BlockedOperations blocked={blocked} />
    </section>
  );
}
