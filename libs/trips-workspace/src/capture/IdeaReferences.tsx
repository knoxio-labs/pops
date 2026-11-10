import { useSyncExternalStore } from 'react';

import { Button, Textarea, TextInput } from '@pops/ui';

import { referenceEntries } from '../reference-entries';
import { CaptureContactReference } from './CaptureContactReference';

import type { JSX } from 'react';

import type { IdeaFieldProps } from './idea-field-types';

type Props = Pick<IdeaFieldProps, 'session' | 'row' | 'value' | 'busy'>;
type FieldScope = Pick<Props, 'session' | 'row' | 'busy'>;

/** Edit explicit Idea source and Contacts references through retained Trips drafts. */
export function IdeaReferences({ session, row, value, busy }: Props): JSX.Element {
  useSyncExternalStore(
    session.records.subscribe,
    session.records.getVersion,
    session.records.getVersion
  );
  const draft = session.records.idea(row.id)?.input;
  const sourceLinks = draft?.sourceLinks ?? value.sourceLinks;
  const contactLinks = draft?.contactLinks ?? value.contactLinks;
  const recommendations = draft?.recommendations ?? value.recommendations;
  return (
    <section aria-label="Idea references" className="space-y-4">
      <h3 className="font-medium">References</h3>
      <SourceLinks {...{ session, row, links: sourceLinks, busy }} />
      <ContactLinks {...{ session, row, links: contactLinks, busy }} />
      <Recommendations {...{ session, row, items: recommendations, busy }} />
    </section>
  );
}

function SourceLinks({
  session,
  row,
  links,
  busy,
}: FieldScope & { links: Props['value']['sourceLinks'] }): JSX.Element {
  const update = (index: number, replacement?: (typeof links)[number]): void => {
    session.records.editIdea(row, {
      sourceLinks:
        replacement === undefined
          ? links.filter((_, position) => position !== index)
          : links.map((link, position) =>
              position === index ? session.references.replace(link, replacement) : link
            ),
    });
  };
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Source links</h4>
      {links.map((link, index) => (
        <div key={session.references.key(link)} className="grid gap-2 md:grid-cols-2">
          <TextInput
            label={`Source URI ${index + 1}`}
            value={link.uri}
            disabled={busy}
            onChange={(event) => update(index, { ...link, uri: event.currentTarget.value })}
            onBlur={() => void session.records.saveIdea(row.id)}
          />
          <TextInput
            label={`Source label ${index + 1}`}
            value={link.label ?? ''}
            disabled={busy}
            onChange={(event) => update(index, sourceLabel(link, event.currentTarget.value))}
            onBlur={() => void session.records.saveIdea(row.id)}
          />
          <Button
            variant="ghost"
            aria-label={`Remove source link ${index + 1}`}
            disabled={busy}
            onClick={() => {
              update(index);
              void session.records.saveIdea(row.id);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => session.records.editIdea(row, { sourceLinks: [...links, { uri: '' }] })}
      >
        Add source link
      </Button>
    </div>
  );
}

function sourceLabel(
  link: Props['value']['sourceLinks'][number],
  label: string
): Props['value']['sourceLinks'][number] {
  const { label: _previous, ...withoutLabel } = link;
  return label === '' ? withoutLabel : { ...link, label };
}

function ContactLinks({
  session,
  row,
  links,
  busy,
}: FieldScope & { links: Props['value']['contactLinks'] }): JSX.Element {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Contacts</h4>
      {referenceEntries(links).map(({ link, index, key }) => (
        <div key={key} className="flex flex-wrap items-center justify-between gap-2">
          <CaptureContactReference session={session} reference={link} />
          <Button
            variant="ghost"
            aria-label={`Remove contact reference ${index + 1}`}
            disabled={busy}
            onClick={() => {
              session.records.editIdea(row, {
                contactLinks: links.filter((_, position) => position !== index),
              });
              void session.records.saveIdea(row.id);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={busy || !session.contacts.available}
        onClick={() => session.contacts.open({ kind: 'idea-contact', id: row.id }, true)}
      >
        Add contact
      </Button>
    </div>
  );
}

function Recommendations({
  session,
  row,
  items,
  busy,
}: FieldScope & { items: Props['value']['recommendations'] }): JSX.Element {
  const editNote = (index: number, note: string): void => {
    session.records.editIdea(row, {
      recommendations: items.map((item, position) =>
        position === index ? session.references.replace(item, { ...item, note }) : item
      ),
    });
  };
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Recommendations</h4>
      {items.map((item, index) => (
        <div
          key={session.references.key(item)}
          className="space-y-2 rounded-md border border-border p-3"
        >
          <CaptureContactReference session={session} reference={item.contact} />
          <Textarea
            aria-label={`Recommendation note ${index + 1}`}
            value={item.note}
            disabled={busy}
            onChange={(event) => editNote(index, event.currentTarget.value)}
            onBlur={() => void session.records.saveIdea(row.id)}
          />
          <Button
            variant="ghost"
            aria-label={`Remove recommendation ${index + 1}`}
            disabled={busy}
            onClick={() => {
              session.records.editIdea(row, {
                recommendations: items.filter((_, position) => position !== index),
              });
              void session.records.saveIdea(row.id);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={busy || !session.contacts.available}
        onClick={() => session.contacts.open({ kind: 'recommendation', id: row.id }, true)}
      >
        Add recommendation
      </Button>
    </div>
  );
}
