import { Badge, Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';
import { JourneyOptionSummary } from './JourneyOptionSummary';
import { JourneyRecord } from './JourneyRecord';
import { useJourneyAlternatives } from './use-journey-alternatives';

import type { JSX } from 'react';

import type { JourneyGroup, JourneyWorkspaceProps } from './types';
import type { JourneyAlternativesModel } from './use-journey-alternatives';
import type { JourneyNavigation } from './use-journey-navigation';

/** Each published membership has explicit group-scoped actions; no first-match group is inferred. */
export function JourneyAlternatives({
  identity,
  navigation,
}: {
  identity: JourneyWorkspaceProps;
  navigation: JourneyNavigation;
}): JSX.Element {
  const model = useJourneyAlternatives(identity, navigation);
  return (
    <section aria-label="Journey alternatives" className="space-y-3 border-t pt-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Alternatives</h2>
        {model.undo && (
          <Button
            variant="ghost"
            disabled={!model.canUndo}
            onClick={() => void model.undoSelection()}
          >
            Undo selection
          </Button>
        )}
        {model.groups.length === 0 && (
          <Button
            variant="ghost"
            disabled={
              model.busy || model.needsReload || model.query.isPending || model.query.isError
            }
            onClick={() => void model.add()}
          >
            Add option
          </Button>
        )}
      </header>
      {model.query.isPending && <p role="status">Loading alternatives…</p>}
      {model.query.isError && (
        <ErrorState
          error={requestProblem(model.query.error)}
          onRetry={() => void model.query.refetch()}
        />
      )}
      {model.needsReload && (
        <div className="space-y-2">
          {model.failure !== undefined && <ErrorState error={requestProblem(model.failure)} />}
          <Button variant="outline" disabled={model.busy} onClick={model.reload}>
            Reload alternatives
          </Button>
        </div>
      )}
      {model.groups.map((group) => (
        <JourneyOptions key={group.id} group={group} model={model} identity={identity} />
      ))}
    </section>
  );
}

function JourneyOptions({
  group,
  model,
  identity,
}: {
  group: JourneyGroup;
  model: JourneyAlternativesModel;
  identity: JourneyWorkspaceProps;
}): JSX.Element {
  const busy = model.busy;
  return (
    <section aria-label={`Alternative group ${group.id}`} className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        {model.groups.length > 1 && <h3 className="font-medium">Group {group.id}</h3>}
        <Button
          variant="ghost"
          disabled={busy || model.needsReload || model.query.isError}
          onClick={() => void model.add(group)}
        >
          Add option
        </Button>
      </header>
      {[group.currentJourneyId, ...group.alternativeJourneyIds]
        .filter((id) => id !== identity.journeyId)
        .map((id) => (
          <JourneyOption key={id} group={group} model={model} identity={identity} id={id} />
        ))}
    </section>
  );
}

function JourneyOption({
  group,
  model,
  identity,
  id,
}: {
  group: JourneyGroup;
  model: JourneyAlternativesModel;
  identity: JourneyWorkspaceProps;
  id: number;
}): JSX.Element {
  const { expanded, setExpanded, busy, select } = model;
  return (
    <article
      aria-label={`Journey option ${id}`}
      className="space-y-3 rounded-xl border border-dashed bg-card p-3"
    >
      <JourneyOptionSummary {...identity} journeyId={id} />
      {group.currentJourneyId === id && <Badge>Current selection</Badge>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          disabled={busy}
          aria-expanded={expanded?.groupId === group.id && expanded.journeyId === id}
          onClick={() =>
            setExpanded(
              expanded?.groupId === group.id && expanded.journeyId === id
                ? undefined
                : { groupId: group.id, journeyId: id }
            )
          }
        >
          Edit option
        </Button>
        <Button
          variant="outline"
          disabled={busy || model.needsReload || model.query.isError}
          onClick={() => void select(group, id)}
        >
          Use journey
        </Button>
      </div>
      {expanded?.groupId === group.id && expanded.journeyId === id && (
        <JourneyRecord {...identity} journeyId={id} />
      )}
    </article>
  );
}
