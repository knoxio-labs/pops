import { TableCell } from '@pops/ui';

import { ContactReference } from '../arrangements/ContactReference';

import type { JSX } from 'react';

import type { ArrangementResponsibility } from '../arrangements/types';
import type { OverviewSource, OverviewViewProps } from './types';

/** Show only explicitly stored responsibility and resolve Contact names through the host capability. */
export function OverviewOwner({
  props,
  source,
}: {
  props: OverviewViewProps;
  source: OverviewSource;
}): JSX.Element {
  const target = responsibilityTarget(source);
  if (!target) return <span aria-hidden>—</span>;
  const rows = props.sources.responsibilities;
  if (!rows) return <span>{props.labels.sheet.ownerUnknown}</span>;
  const owner = rows.find(
    (candidate) =>
      candidate.tripId === props.tripId &&
      candidate.targetKind === target.targetKind &&
      candidate.targetId === target.targetId
  )?.responsibility;
  if (!owner) return <span>{props.labels.sheet.ownerUnset}</span>;
  if (owner.kind === 'self')
    return <span>{props.responsibility?.labels.self ?? props.labels.sheet.self}</span>;
  if (!props.responsibility) return <span>{props.labels.sheet.contact}</span>;
  return (
    <ContactReference
      identity={{ tripId: props.tripId, client: props.client, ...props.responsibility }}
      uri={owner.uri}
      interactive
    />
  );
}

/** Render the exact owner's responsibility in the Sheet column. */
export function OverviewOwnerCell({
  props,
  source,
}: {
  props: OverviewViewProps;
  source: OverviewSource;
}): JSX.Element {
  return (
    <TableCell>
      <OverviewOwner props={props} source={source} />
    </TableCell>
  );
}

function responsibilityTarget(
  source: OverviewSource
): Pick<ArrangementResponsibility, 'targetKind' | 'targetId'> | undefined {
  switch (source.kind) {
    case 'stay':
    case 'event':
    case 'rental':
    case 'journey':
      return { targetKind: source.kind, targetId: source.id };
    case 'visit':
    case 'decision':
    case 'meeting':
    case 'capture':
    case 'idea':
      return undefined;
  }
}
