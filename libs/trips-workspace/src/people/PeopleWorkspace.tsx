import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { currentSourceOwner, sourceOwner } from '../arrangements/source-owner';
import { loadOwnedMeetingPlans, peopleOwnerQueryKey, peopleQueryKey } from './api';
import { PeopleChooser } from './PeopleChooser';
import { PeopleControls } from './PeopleControls';
import { PeopleGroups } from './PeopleGroups';
import { PeopleProblems, SourceFailure } from './PeopleProblems';
import { ownedPeopleSession } from './session';
import { usePeopleContext } from './use-people-context';

import type { JSX } from 'react';

import type { SourceOwner } from '../arrangements/source-owner';
import type { MeetingPlan, PeopleWorkspaceProps } from './types';

/** Source-backed People workspace grouped by exact Visit occurrence and persisted route order. */
export function PeopleWorkspace(props: PeopleWorkspaceProps): JSX.Element {
  return Number.isSafeInteger(props.tripId) && props.tripId > 0 ? (
    <PeopleSource key={JSON.stringify(peopleQueryKey(props))} {...props} />
  ) : (
    <p role="alert">
      {props.text('invalid')} <code>trips.identity.invalid</code>
    </p>
  );
}
function PeopleSource(props: PeopleWorkspaceProps): JSX.Element {
  const [owner] = useState(() => sourceOwner(props));
  const source = useQuery({
    queryKey: peopleOwnerQueryKey(owner),
    queryFn: () => loadOwnedMeetingPlans(owner),
    retry: false,
  });
  if (source.data === undefined)
    return (
      <div className="p-4">
        {source.isPending ? (
          <p role="status">{props.text('loading')}</p>
        ) : (
          <SourceFailure
            error={source.error}
            text={props.text}
            retry={() => void source.refetch()}
          />
        )}
      </div>
    );
  return (
    <>
      {source.isError && (
        <SourceFailure error={source.error} text={props.text} retry={() => void source.refetch()} />
      )}
      <PeopleSession {...props} owner={owner} initial={source.data} />
    </>
  );
}
function PeopleSession(
  props: PeopleWorkspaceProps & { initial: MeetingPlan[]; owner: SourceOwner }
): JSX.Element {
  const [editor] = useState(() => ownedPeopleSession(props.owner, props.initial));
  const state = useSyncExternalStore(editor.subscribe, editor.snapshot);
  useEffect(() => {
    if (currentSourceOwner(props.owner, props.owner)) editor.refresh(props.initial);
  }, [editor, props.initial, props.owner]);
  const context = usePeopleContext(props.owner);
  const [filters, setFilters] = useState({ query: '', intention: '', agreement: '', visitId: '' });
  const [adding, setAdding] = useState(false);
  return (
    <section className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <PeopleControls
        context={context}
        workspace={props}
        editor={editor}
        state={state}
        filters={filters}
        setFilters={setFilters}
        add={() => setAdding(true)}
      />
      <PeopleProblems editor={editor} state={state} context={context} workspace={props} />
      <PeopleGroups
        editor={editor}
        state={state}
        context={context}
        workspace={props}
        filters={filters}
      />
      <PeopleChooser
        workspace={props}
        intentKey="add"
        open={adding}
        onOpenChange={setAdding}
        onSelect={(contactUri) => {
          void editor.run({ kind: 'create', input: { contactUri } });
          setAdding(false);
        }}
      />
    </section>
  );
}
