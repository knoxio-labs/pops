import { ArrowRight } from 'lucide-react';

import { contactKindLabel, FactGroup } from './facts';

import type { DuplicateState, MergePreview } from './model';

function sourceLabel(state: DuplicateState, sourceId: string): string {
  const index = state.pairIds.indexOf(sourceId);
  const contact = state.contacts.find((item) => item.id === sourceId);
  return `Contact ${index + 1} · ${contact?.name ?? sourceId}`;
}

function SourceFact({
  state,
  sourceId,
  children,
}: {
  state: DuplicateState;
  sourceId: string;
  children: React.ReactNode;
}) {
  return (
    <li className="space-y-1 break-words rounded-lg border border-border bg-background p-3">
      <div className="whitespace-pre-wrap text-sm">{children}</div>
      <p className="text-xs text-muted-foreground">From {sourceLabel(state, sourceId)}</p>
    </li>
  );
}

/** Shows all nonblank projected facts with stable source attribution, including repeated values. */
export function CombinedFacts({
  preview,
  state,
}: {
  preview: MergePreview;
  state: DuplicateState;
}) {
  return (
    <section
      aria-label="Combined facts"
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold leading-tight tracking-normal">Combined facts</h2>
      <CombinedAliases preview={preview} state={state} />
      {preview.methods.length > 0 && (
        <FactGroup label="Contact methods">
          <ul className="space-y-2">
            {preview.methods.map(({ sourceId, method }) => (
              <SourceFact key={`${sourceId}-${method.id}`} state={state} sourceId={sourceId}>
                {method.label && <span className="mr-2 text-muted-foreground">{method.label}</span>}
                {method.value}
              </SourceFact>
            ))}
          </ul>
        </FactGroup>
      )}
      {preview.addresses.length > 0 && (
        <FactGroup label="Addresses">
          <ul className="space-y-2">
            {preview.addresses.map(({ sourceId, address }) => (
              <SourceFact key={`${sourceId}-${address.id}`} state={state} sourceId={sourceId}>
                {address.label && (
                  <span className="mr-2 text-muted-foreground">{address.label}</span>
                )}
                {[address.value, address.city].filter(Boolean).join(' · ')}
              </SourceFact>
            ))}
          </ul>
        </FactGroup>
      )}
      {preview.notes.length > 0 && (
        <FactGroup label="Notes">
          <ul className="space-y-2">
            {preview.notes.map((note) => (
              <SourceFact key={note.sourceId} state={state} sourceId={note.sourceId}>
                {note.value}
              </SourceFact>
            ))}
          </ul>
        </FactGroup>
      )}
    </section>
  );
}

function ReferenceProjection({ preview, state }: { preview: MergePreview; state: DuplicateState }) {
  if (!preview.references.length) return null;
  return (
    <section
      aria-label="Linked records"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <h2 className="text-base font-semibold leading-tight tracking-normal">Linked records</h2>
      <ul className="space-y-4">
        {preview.references.map((reference) => (
          <li
            key={reference.id}
            className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0"
          >
            <p className="text-sm font-medium">
              {reference.title}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {reference.pillar}
              </span>
            </p>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-xs text-muted-foreground">Current: </span>
                {sourceLabel(state, reference.originalContactId)}
              </p>
              <p className="flex items-center gap-2">
                <ArrowRight className="size-4 shrink-0 text-app-accent" aria-hidden />
                <span>
                  <span className="text-xs text-muted-foreground">Preview: </span>
                  {sourceLabel(state, reference.resolvedContactId)}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Original references and contact identities remain unchanged.
      </p>
    </section>
  );
}

/** Renders a projection only; no apply, merge or delete operation exists in this prototype. */
export function DuplicateResult({
  preview,
  state,
}: {
  preview: MergePreview;
  state: DuplicateState;
}) {
  const retained = state.contacts.find((contact) => contact.id === preview.retainedId);
  return (
    <div className="space-y-4" aria-label="Preview result">
      <section
        aria-label="Merge preview"
        className="space-y-3 rounded-xl border border-app-accent/40 bg-card p-4"
      >
        <p className="text-xs font-medium text-app-accent">Merge preview</p>
        <h2 className="break-words text-base font-semibold leading-tight tracking-normal">
          {preview.name}
        </h2>
        <p className="text-sm">{contactKindLabel(preview.kind)}</p>
        <p className="text-xs text-muted-foreground">
          Keep contact: {sourceLabel(state, preview.retainedId)}
        </p>
        {retained && (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Source: {retained.origin}
            {retained.legacy ? ' · Original Finance identity retained' : ''}
          </p>
        )}
      </section>
      <CombinedFacts preview={preview} state={state} />
      <ReferenceProjection preview={preview} state={state} />
    </div>
  );
}

function CombinedAliases({ preview, state }: { preview: MergePreview; state: DuplicateState }) {
  if (!preview.aliases.length) return null;
  const occurrences = new Map<string, number>();
  const aliases = preview.aliases.map((alias) => {
    const identity = JSON.stringify([alias.sourceId, alias.value]);
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    return { ...alias, key: `${identity}-${occurrence}` };
  });
  return (
    <FactGroup label="Aliases">
      <ul className="space-y-2">
        {aliases.map((alias) => (
          <SourceFact key={alias.key} state={state} sourceId={alias.sourceId}>
            {alias.value}
          </SourceFact>
        ))}
      </ul>
    </FactGroup>
  );
}
