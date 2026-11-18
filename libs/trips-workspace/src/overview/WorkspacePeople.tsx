import { UserRound } from 'lucide-react';

import { ContactReference } from '../arrangements/ContactReference';
import { workspacePeople } from './workspace-people-model';

import type { JSX } from 'react';

import type { OverviewViewProps } from './types';

/** Show only people explicitly attached to meeting plans or arrangement responsibility. */
export function WorkspacePeople(props: OverviewViewProps): JSX.Element {
  const people = workspacePeople(props);
  const readsAvailable =
    props.sources.meetings !== undefined && props.sources.responsibilities !== undefined;
  const title = props.labels.status('workspace.peopleOnTrip');
  const context = {
    tripId: props.tripId,
    client: props.client,
    contacts: props.responsibility?.contacts,
    labels: props.labels.responsibility,
  };
  return (
    <section
      aria-label={title}
      className="min-w-0 rounded-2xl border border-trip-line bg-trip-surface p-4 sm:p-5"
    >
      <h2 className="font-trip-display text-lg font-semibold">{title}</h2>
      {!readsAvailable ? (
        <p className="mt-2 text-sm leading-relaxed text-trip-muted">
          {props.labels.status('workspace.responsibilityUnavailable')}
        </p>
      ) : people.length > 0 ? (
        <ul className="mt-3 divide-y divide-trip-line">
          {people.map((person) => (
            <li
              key={person.uri}
              className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-trip-experience-soft text-trip-experience">
                <UserRound className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <ContactReference identity={context} uri={person.uri} interactive />
                {person.contexts.length > 0 && (
                  <p className="break-words text-xs leading-relaxed text-trip-muted">
                    {person.contexts.join(' · ')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-trip-muted">
          {props.labels.status('workspace.noLinkedPeople')}
        </p>
      )}
    </section>
  );
}
