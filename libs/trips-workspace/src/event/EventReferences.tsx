import { useState } from 'react';

import { Button, Chip, TextInput } from '@pops/ui';

import type { JSX } from 'react';

import type { EventPatch, TripEvent } from './types';

const groups = [
  { field: 'sourceLinks', label: 'Sources' },
  { field: 'venueLinks', label: 'Venue references' },
  { field: 'documentLinks', label: 'Document references' },
] as const;

/** Capture/remove opaque source references without claiming contact or document resolution. */
export function EventReferences({
  event,
  commit,
}: {
  event: TripEvent;
  commit: (patch: EventPatch) => void;
}): JSX.Element {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ReferenceGroup key={group.field} {...group} event={event} commit={commit} />
      ))}
    </div>
  );
}

function ReferenceGroup({
  field,
  label,
  event,
  commit,
}: {
  field: (typeof groups)[number]['field'];
  label: string;
  event: TripEvent;
  commit: (patch: EventPatch) => void;
}): JSX.Element {
  const [uri, setUri] = useState('');
  const [name, setName] = useState('');
  return (
    <section aria-label={label} className="space-y-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <ReferenceList
        links={event[field]}
        label={label}
        remove={(position) =>
          commit({ [field]: event[field].filter((_, index) => index !== position) })
        }
      />
      <div className="grid items-end gap-2 sm:grid-cols-2">
        <TextInput
          label={`${label} URI`}
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          className="min-h-11"
        />
        <TextInput
          label={`${label} label`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-11"
        />
      </div>
      <Button
        className="min-h-11"
        variant="outline"
        disabled={!uri.trim()}
        onClick={() => {
          const sourceLabel = name.trim();
          commit({
            [field]: [
              ...event[field],
              { uri: uri.trim(), ...(sourceLabel ? { label: sourceLabel } : {}) },
            ],
          });
          setUri('');
          setName('');
        }}
      >
        Add {label.toLowerCase()} link
      </Button>
    </section>
  );
}

function ReferenceList({
  links,
  label,
  remove,
}: {
  links: TripEvent['sourceLinks'];
  label: string;
  remove: (index: number) => void;
}): JSX.Element {
  const occurrences = new Map<string, number>();
  const entries = links.map((link, index) => {
    const content = JSON.stringify(link);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { link, index, key: `${content}:${occurrence}` };
  });
  return (
    <>
      {links.length === 0 && <p className="text-sm text-muted-foreground">No links recorded</p>}
      <div className="flex flex-wrap gap-3">
        {entries.map(({ link, index, key }) => (
          <Chip
            key={key}
            variant="outline"
            className="max-w-full"
            removable
            removeLabel={`Remove ${label.toLowerCase()} link ${index + 1}`}
            onRemove={() => remove(index)}
          >
            <span className="break-all" title={link.uri}>
              {link.label ?? link.uri}
            </span>
          </Chip>
        ))}
      </div>
    </>
  );
}
