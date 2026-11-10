import { StayFields } from './StayFields';
import { StayHost } from './StayHost';
import { StayReferences } from './StayReferences';
import { StayTimeline } from './StayTimeline';

import type { JSX } from 'react';

import type { StayWorkspaceProps } from './types';
import type { StayContext } from './use-stay-context';
import type { StayEditor } from './use-stay-editor';

/** Compose Stay-owned fields with the shared owner contact protocol under the serial source write guard. */
export function StaySourceFacts({
  editor,
  identity,
  context,
}: {
  editor: StayEditor;
  identity: StayWorkspaceProps;
  context: StayContext;
}): JSX.Element {
  return (
    <fieldset disabled={editor.busy} className="min-w-0 space-y-4">
      <legend className="sr-only">Stay source facts</legend>
      <StayTimeline stay={editor.draft} stays={context.stays.data ?? []}>
        <StayFields
          stay={editor.draft}
          visits={context.visits.data ?? []}
          places={context.places.data ?? []}
          edit={editor.edit}
          commit={(patch) => void editor.commit(patch)}
        />
        <StayHost
          identity={identity}
          links={editor.draft.hostLinks}
          disabled={editor.busy}
          commit={(patch) => void editor.commit(patch)}
        />
        <StayReferences stay={editor.draft} commit={(patch) => void editor.commit(patch)} />
      </StayTimeline>
    </fieldset>
  );
}
