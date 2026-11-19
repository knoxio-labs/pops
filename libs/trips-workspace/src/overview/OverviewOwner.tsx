import { TableCell } from '@pops/ui';

import { ContactReference, ContactReferenceValue } from '../arrangements/ContactReference';

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
  return ownerContact(props, owner.uri);
}

function ownerContact(props: OverviewViewProps, uri: string): JSX.Element {
  if (!props.responsibility) return <span>{props.labels.sheet.contact}</span>;
  const identity = { tripId: props.tripId, client: props.client, ...props.responsibility };
  const read = props.workspaceContactReferences?.get(uri);
  if (read)
    return (
      <ContactReferenceValue
        identity={identity}
        result={read.status === 'resolved' ? read.result : undefined}
        readError={read.status === 'error'}
        interactive
      />
    );
  if (props.workspaceContactReferences)
    return <ContactReferenceValue identity={identity} interactive />;
  return <ContactReference identity={identity} uri={uri} interactive />;
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
