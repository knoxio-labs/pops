import { UserRound } from 'lucide-react';

import { ContactReference, ContactReferenceValue } from '../arrangements/ContactReference';
import { workspacePeople } from './workspace-people-model';

import type { JSX } from 'react';

import type { ArrangementResponsibilityContext } from '../arrangements/responsibility-context';
import type { OverviewViewProps, WorkspaceContactReferenceRead } from './types';

/** Show only people explicitly attached to meeting plans or arrangement responsibility. */
export function WorkspacePeople(props: OverviewViewProps): JSX.Element {
  const people = workspacePeople(props);
  const readsAvailable =
    props.sources.meetings !== undefined && props.sources.responsibilities !== undefined;
  const title = props.labels.status('workspace.peopleOnTrip');
  let statusMessage: string | undefined;
  if (!readsAvailable) {
    statusMessage = props.labels.status('workspace.responsibilityUnavailable');
  } else if (people.length === 0) {
    statusMessage = props.labels.status('workspace.noLinkedPeople');
  }
  const context: ArrangementResponsibilityContext = {
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
      {statusMessage !== undefined ? (
        <p className="mt-2 text-sm leading-relaxed text-trip-muted">{statusMessage}</p>
      ) : (
        <ul className="mt-3 divide-y divide-trip-line">
          {people.map((person) => (
            <WorkspacePersonRow
              key={person.uri}
              uri={person.uri}
              contexts={person.contexts}
              identity={context}
              read={props.workspaceContactReferences?.get(person.uri)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkspacePersonRow({
  uri,
  contexts,
  identity,
  read,
}: {
  uri: string;
  contexts: string[];
  identity: ArrangementResponsibilityContext;
  read: WorkspaceContactReferenceRead | undefined;
}): JSX.Element {
  return (
    <li className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-trip-experience-soft text-trip-experience">
        <UserRound className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        {read ? (
          <ContactReferenceValue
            identity={identity}
            result={read.status === 'resolved' ? read.result : undefined}
            readError={read.status === 'error'}
            interactive
          />
        ) : (
          <ContactReference identity={identity} uri={uri} interactive />
        )}
        {contexts.length > 0 && (
          <p className="break-words text-xs leading-relaxed text-trip-muted">
            {contexts.join(' · ')}
          </p>
        )}
      </div>
    </li>
  );
}
