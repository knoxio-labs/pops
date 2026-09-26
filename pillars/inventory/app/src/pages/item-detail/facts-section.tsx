import { Calculator, Info } from 'lucide-react';

import { EmptyState } from '@pops/ui';

import type { DetailFact } from '../../foundation/item-page';

function FactValue({ fact }: { fact: DetailFact }) {
  if (fact.origin === 'missing-inputs') {
    return (
      <span className="truncate text-muted-foreground">
        Needs {(fact.missingInputs ?? []).join(', ')}
      </span>
    );
  }
  if (fact.value === null) return <span className="text-muted-foreground">Not set</span>;
  return <span className={fact.mono ? 'truncate font-mono' : 'truncate'}>{fact.value}</span>;
}

function FactOrigin({ fact }: { fact: DetailFact }) {
  if (fact.origin === 'entered') return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
      <Calculator className="size-3" aria-hidden />
      {fact.origin === 'overridden' ? 'Overridden' : 'Calculated'}
    </span>
  );
}

/** Renders one read-only fact row in the facts rail. */
export function FactRow({ fact, readOnly }: { fact: DetailFact; readOnly: boolean }) {
  return (
    <div
      className="flex min-h-11 items-center gap-2 rounded-md border-l-2 border-transparent px-2 py-1"
      data-fact-key={fact.key}
      data-read-only={readOnly ? 'true' : 'false'}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="truncate text-xs text-muted-foreground">{fact.label}</span>
        <span className="flex w-full min-w-0 items-baseline gap-1.5 text-sm">
          <FactValue fact={fact} />
          <FactOrigin fact={fact} />
        </span>
      </span>
      {readOnly ? (
        <Info className="size-3.5 shrink-0 text-muted-foreground" aria-label="Read only" />
      ) : null}
    </div>
  );
}

/** Renders the mapped facts, including the intentionally quiet empty state. */
export function FactsSection({
  facts,
  readOnly = false,
}: {
  facts: readonly DetailFact[];
  readOnly?: boolean;
}) {
  if (facts.length === 0) {
    return (
      <EmptyState
        icon={Info}
        title="No facts recorded"
        description="This item has no additional fields yet."
        size="sm"
      />
    );
  }
  return (
    <div role="group" aria-label="Facts" className="grid min-w-0 grid-cols-1 gap-0.5">
      {facts.map((fact) => (
        <FactRow key={fact.key} fact={fact} readOnly={readOnly} />
      ))}
    </div>
  );
}
