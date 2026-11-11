import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@pops/ui';

import { MeetingContact } from './MeetingContact';
import { MeetingFields } from './MeetingFields';
import { PeopleChooser } from './PeopleChooser';

import type { JSX, RefObject } from 'react';

import type { Place, Visit } from '../stay/types';
import type { PeopleEditor, PeopleEditorSnapshot } from './editor';
import type { MeetingPatch, MeetingPlan, PeopleWorkspaceProps } from './types';

interface MeetingCardProps {
  plan: MeetingPlan;
  editor: PeopleEditor;
  state: PeopleEditorSnapshot;
  workspace: PeopleWorkspaceProps;
  visits: Visit[];
  places: Place[];
}
/** In-place meeting edits submit only explicit facts against this source's own confirmed revision. */
export function MeetingCard({
  plan,
  editor,
  state,
  workspace,
  visits,
  places,
}: MeetingCardProps): JSX.Element {
  const [choosing, setChoosing] = useState(false);
  const card = useMeetingFocus(
    workspace.meetingId === plan.id && workspace.tripId === plan.tripId && !plan.removed
  );
  const pending = state.failure?.operation.command;
  const draft =
    pending?.kind === 'update' && pending.id === plan.id ? { ...plan, ...pending.patch } : plan;
  const save = (patch: MeetingPatch): void =>
    void editor.run({ kind: 'update', id: plan.id, expectedRevision: plan.revision, patch });
  const text = workspace.text;
  return (
    <article
      ref={card}
      tabIndex={-1}
      aria-label={plan.title || `${text('planTitle')} ${plan.id}`}
      className="min-w-0 rounded-xl border border-border bg-card p-4"
    >
      <fieldset disabled={state.busy || state.failure !== null} className="min-w-0 space-y-3">
        <legend className="sr-only">
          {text('planTitle')} {plan.id}
        </legend>
        <MeetingContact
          uri={draft.contactUri}
          canChoose={workspace.contacts !== undefined}
          contacts={workspace.contacts}
          text={text}
          choose={() => setChoosing(true)}
          clear={() => save({ contactUri: null })}
        />
        <MeetingFields
          editor={editor}
          plan={draft}
          visits={visits}
          places={places}
          text={text}
          save={save}
        />
        <RemoveMeeting plan={plan} editor={editor} text={text} />
      </fieldset>
      <PeopleChooser
        workspace={workspace}
        intentKey={`plan:${plan.id}`}
        open={choosing}
        onOpenChange={setChoosing}
        onSelect={(uri) => {
          save({ contactUri: uri });
          setChoosing(false);
        }}
      />
    </article>
  );
}

function useMeetingFocus(selected: boolean): RefObject<HTMLElement | null> {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) card.current?.focus();
  }, [selected]);
  return card;
}

function RemoveMeeting({
  plan,
  editor,
  text,
}: Pick<MeetingCardProps, 'plan' | 'editor'> & {
  text: PeopleWorkspaceProps['text'];
}): JSX.Element {
  return (
    <Button
      variant="ghost"
      className="min-h-11"
      onClick={() =>
        void editor.run({ kind: 'remove', id: plan.id, expectedRevision: plan.revision })
      }
    >
      <Trash2 aria-hidden className="size-4" />
      {text('remove')}
    </Button>
  );
}
