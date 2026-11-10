import { useState } from 'react';

import { ApiError } from '@pops/pillar-sdk/client';
import { Button } from '@pops/ui';

import { loadOwnedMeetingPlans } from './api';

import type { JSX } from 'react';

import type { PeopleSectionProps } from './PeopleControls';
import type { PeopleText } from './types';

/** Safe source diagnostics and exact-operation retry remain visible until recovery succeeds. */
export function SourceFailure({
  error,
  text,
  retry,
}: {
  error: unknown;
  text: PeopleText;
  retry: () => void;
}): JSX.Element {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
      {text('failed')}{' '}
      <code>{error instanceof ApiError ? error.code : 'trips.people.request'}</code>
      <Button variant="ghost" className="min-h-11" onClick={retry}>
        {text('retry')}
      </Button>
    </div>
  );
}

/** Canonical reload is offered only for definitively rejected writes, never to release an uncertain create. */
export function PeopleProblems({
  state,
  editor,
  context,
  workspace,
}: PeopleSectionProps): JSX.Element {
  const [reloadError, setReloadError] = useState<unknown>();
  const text = workspace.text;
  const error = state.failure?.error;
  const rejected =
    error instanceof ApiError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500;
  const reload = (): void => {
    void loadOwnedMeetingPlans(context.owner)
      .then((plans) => {
        editor.reload(plans);
        setReloadError(undefined);
      })
      .catch(setReloadError);
  };
  return (
    <>
      {state.failure && (
        <SourceFailure error={error} text={text} retry={() => void editor.retry()} />
      )}
      {rejected && (
        <Button className="min-h-11" variant="outline" onClick={reload}>
          {text('reload')}
        </Button>
      )}
      {reloadError !== undefined && (
        <SourceFailure error={reloadError} text={text} retry={reload} />
      )}
      {(context.visits.isError || context.places.isError || context.trip.isError) && (
        <div role="alert" className="text-sm text-destructive">
          {text('contextFailed')} <code>trips.people.context</code>
          <Button
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              void context.visits.refetch();
              void context.places.refetch();
              void context.trip.refetch();
            }}
          >
            {text('retry')}
          </Button>
        </div>
      )}
    </>
  );
}
