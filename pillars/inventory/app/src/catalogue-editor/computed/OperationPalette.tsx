import { ChevronRight, X } from 'lucide-react';

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import { valueTypeLabel } from '../expression/model';
import { OPERATIONS, operationBlockedReason } from '../expression/operations';
import { nodeAt } from '../expression/tree';
import { place, placedNode, wrap } from './builder-actions';
import { useBuilder } from './BuilderContext';
import { choiceFieldAt, nodeTitle, slotDescription } from './node-labels';

import type { OperationInfo } from '../expression/operations';

type PaletteMode = 'insert' | 'wrap';

function OperationButton({ info, onPick }: { info: OperationInfo; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={info.label}
      title={info.hint}
      onClick={onPick}
      className="flex min-h-11 min-w-11 w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left hover:border-primary hover:bg-primary/5"
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

function usePaletteChoices(mode: PaletteMode) {
  const { context, root, slots, selectedPath } = useBuilder();
  const expected = slots.get(selectedPath);
  const choiceField = choiceFieldAt(context, root, selectedPath);
  const candidates = OPERATIONS.filter(
    (info) => mode === 'insert' || (info.op !== 'read' && info.op !== 'literal')
  );
  const reasons = candidates.map((info) => {
    const typed = expected === undefined ? null : operationBlockedReason(info, expected);
    const unplaceable =
      typed === null && placedNode(context, info.op, expected, choiceField) === null;
    return { info, reason: unplaceable ? 'Nothing here fits this slot' : typed };
  });
  return {
    expected,
    offered: reasons.flatMap(({ info, reason }) => (reason === null ? [info] : [])),
    blocked: reasons.flatMap(({ info, reason }) => (reason === null ? [] : [{ info, reason }])),
  };
}

/**
 * Picks what fills the selected slot, or what wraps the selected node. Only
 * the operations the slot can take are offered; the rest are disclosed with
 * the reason, so the grammar stays learnable without lengthening the panel.
 */
export function OperationPalette({ mode }: { mode: PaletteMode }) {
  const builder = useBuilder();
  const { context, root, selectedPath } = builder;
  const selected = nodeAt(root, selectedPath) ?? root;
  const { expected, offered, blocked } = usePaletteChoices(mode);
  const target =
    mode === 'insert' ? slotDescription(root, selectedPath) : nodeTitle(context, selected);
  const pick = (info: OperationInfo) => {
    if (mode === 'wrap' && info.op !== 'read' && info.op !== 'literal') {
      const wrapped = wrap(root, selectedPath, info.op);
      builder.change(wrapped.root, wrapped.selected);
      return;
    }
    const choiceField = choiceFieldAt(context, root, selectedPath);
    const placed = placedNode(context, info.op, expected, choiceField);
    if (placed === null) return;
    const next = place(root, selectedPath, placed);
    builder.change(next.root, next.selected);
  };
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
        {selected.op !== 'empty' && (
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Close"
            onClick={() => builder.setPanel('node')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {offered.map((info) => (
          <OperationButton key={info.op} info={info} onPick={() => pick(info)} />
        ))}
      </div>
      <BlockedOperations blocked={blocked} />
    </section>
  );
}
