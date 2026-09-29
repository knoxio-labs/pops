import { SheetPanel } from '@pops/ui';

import { SheetSection } from '../sheet-section.js';
import { changedFields, eventFieldLabel } from './activity-model.js';

import type { ReactElement } from 'react';

import type { EventModel } from '../../../foundation/model/model.js';
import type { WebEvent } from '../../../inventory-web/useWebEvents.js';

/** Props for the read-only Activity event detail sheet. */
export interface EventDetailSheetProps {
  event: EventModel;
  source?: WebEvent;
  onClose?: () => void;
}

function fullTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString('en-AU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

function Fact({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function ChangedFieldRows({ source }: { source: WebEvent }): ReactElement {
  const fields = changedFields(source);
  if (fields.length === 0) {
    return (
      <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">No field values recorded.</p>
    );
  }
  return (
    <div className="divide-y overflow-hidden rounded-lg border">
      {fields.map((field) => (
        <div
          key={field.name}
          className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-3 py-2"
        >
          <span className="truncate text-xs text-muted-foreground">{field.label}</span>
          <span className="min-w-0 break-words text-sm" data-testid={`before-${field.name}`}>
            {field.before}
          </span>
          <span className="min-w-0 break-words text-sm" data-testid={`after-${field.name}`}>
            {field.after}
          </span>
        </div>
      ))}
    </div>
  );
}

function FallbackChangedField({ event }: { event: EventModel }): ReactElement {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 rounded-lg border px-3 py-2 text-sm">
      <span className="text-xs text-muted-foreground">Value</span>
      <span className="min-w-0 break-words">{event.before ?? '—'}</span>
      <span className="min-w-0 break-words">{event.after ?? '—'}</span>
    </div>
  );
}

/** Renders one event's immutable metadata and changed values without write controls. */
export function EventDetailSheet({ event, source, onClose }: EventDetailSheetProps): ReactElement {
  return (
    <SheetPanel
      title={event.summary}
      description={event.itemName}
      onClose={onClose}
      className="rounded-xl"
    >
      <div className="space-y-5">
        <dl className="divide-y overflow-hidden rounded-lg border">
          <Fact label="When" value={fullTime(event.at)} />
          <Fact label="By" value={event.actorName} />
          <Fact label="Entity" value={event.itemName} />
          <Fact label="Event" value={source?.kind ?? eventFieldLabel(event.kind)} />
          <Fact label="Sequence" value={source === undefined ? event.id : String(source.seq)} />
        </dl>
        <SheetSection title="Changed fields">
          {source === undefined ? (
            <FallbackChangedField event={event} />
          ) : (
            <ChangedFieldRows source={source} />
          )}
        </SheetSection>
        {event.reason === null ? null : (
          <SheetSection title="Reason">
            <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">{event.reason}</p>
          </SheetSection>
        )}
      </div>
    </SheetPanel>
  );
}
