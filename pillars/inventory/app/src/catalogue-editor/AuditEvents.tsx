import { Database } from 'lucide-react';

import { Badge } from '@pops/ui';

import type { TypesReadAuditResponse } from '../inventory-api/types.gen';

type AuditEvent = TypesReadAuditResponse['events'][number];

interface AuditEventsProps {
  readonly error: unknown;
  readonly events: readonly AuditEvent[] | undefined;
  readonly loading: boolean;
}

/** Renders catalogue audit query states and immutable lifecycle events. */
export function AuditEvents({ error, events, loading }: AuditEventsProps) {
  if (loading)
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading history…</p>;
  if (error !== null)
    return (
      <p className="py-8 text-center text-sm text-destructive">Failed to load audit history.</p>
    );
  if (events?.length === 0)
    return (
      <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
        <Database className="mb-3 h-8 w-8" />
        <p>No publication events yet.</p>
      </div>
    );
  return (
    <div className="space-y-3">
      {events?.map((event) => (
        <AuditEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

function AuditEventCard({ event }: { readonly event: AuditEvent }) {
  const timestamp = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(event.serverTime));
  const actor = event.actor.label ?? event.actor.id ?? event.actor.kind;
  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">Revision {event.revision}</p>
          <p className="text-sm text-muted-foreground">{timestamp}</p>
        </div>
        <Badge variant="outline" className="capitalize">
          {event.kind}
        </Badge>
      </div>
      <p className="mt-3 text-sm">
        {actor}
        {event.affectedItems > 0 ? ` · ${event.affectedItems} affected items` : ''}
      </p>
      {event.migrationName !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          Migration: <span className="font-mono">{event.migrationName}</span>
        </p>
      )}
    </article>
  );
}
