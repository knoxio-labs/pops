import { Button, ErrorState } from '@pops/ui';

import { requestProblem } from '../stay/api';

import type { JSX } from 'react';

import type { AccommodationGapLabels } from './accommodation-gap-types';
import type { GapCapture } from './use-gap-capture';

/** Preserve uncertain gap recovery controls independently of the active source editor. */
export function GapProblems({
  capture,
  identity,
}: {
  capture: GapCapture;
  identity: { labels: AccommodationGapLabels };
}): JSX.Element | null {
  if (capture.failure === undefined) return null;
  return (
    <>
      <ErrorState error={requestProblem(capture.failure)} />
      {capture.uncertain && (
        <p role="status" className="text-sm text-muted-foreground">
          {identity.labels.creationUncertain}
        </p>
      )}
      <Button
        variant="ghost"
        className="min-h-11"
        disabled={capture.busy}
        onClick={() => void capture.reload()}
      >
        {identity.labels.reload}
      </Button>
      {capture.uncertain && (
        <Button
          variant="outline"
          className="min-h-11"
          disabled={capture.busy}
          onClick={capture.beginNew}
        >
          {identity.labels.beginNewStay}
        </Button>
      )}
    </>
  );
}
