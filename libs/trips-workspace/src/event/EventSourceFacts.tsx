import { EventFields } from './EventFields';
import { EventOrganisers } from './EventOrganisers';
import { EventReferences } from './EventReferences';
import { EventRoute } from './EventRoute';

import type { JSX } from 'react';

import type { Place, Visit } from '../stay/types';
import type { EventWorkspaceProps } from './types';
import type { EventEditor } from './use-event-editor';

/** Compose source fields and owner-selected organisers under the editor's serial write guard. */
export function EventSourceFacts({
  editor,
  identity,
  visits,
  places,
}: {
  editor: EventEditor;
  identity: EventWorkspaceProps;
  visits: Visit[];
  places: Place[];
}): JSX.Element {
  return (
    <fieldset disabled={editor.busy} className="min-w-0">
      <legend className="sr-only">Event source facts</legend>
      <EventRoute event={editor.draft} visits={visits} places={places}>
        <EventFields
          event={editor.draft}
          visits={visits}
          places={places}
          edit={editor.edit}
          commit={(patch) => void editor.commit(patch)}
        />
        <EventReferences event={editor.draft} commit={(patch) => void editor.commit(patch)} />
        <EventOrganisers
          identity={identity}
          links={editor.draft.organiserLinks}
          disabled={editor.busy}
          commit={(patch) => void editor.commit(patch)}
        />
      </EventRoute>
    </fieldset>
  );
}
