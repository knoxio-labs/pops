import { Button } from '@pops/ui';

import { DocumentGroup } from './DocumentGroup';
import { documentTargetLabel } from './model';
import { useTripDocumentData } from './useTripDocumentData';

import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client as TripsClient } from '../trips-api/client';
import type { TripDocumentTargetRecord } from './api';
import type { DocumentAssociationTarget, TripDocumentAssociation } from './types';
import type { TripDocumentData } from './useTripDocumentData';

/** List explicit Trips links grouped by trip and route target. */
export function TripDocumentLinks({
  tripId,
  tripsClient,
  documentsClient,
}: {
  tripId: number;
  tripsClient?: TripsClient;
  documentsClient?: DocumentsClient;
}): ReactElement {
  const data = useTripDocumentData(tripId, tripsClient, documentsClient);
  const hasVisitLinks = data.associations.some((item) => item.targetKind === 'visit');
  return (
    <>
      <LinkLoading pending={data.associationsQuery.isPending} />
      <LinkLoadError query={data.associationsQuery} />
      <UnlinkError visible={data.unlinkMutation.isError} />
      <RouteOrderError visible={data.routeVisitsQuery.isError && hasVisitLinks} />
      <DocumentGroups
        data={data}
        onUnlink={data.unlinkMutation.mutate}
        busy={data.unlinkMutation.isPending}
      />
      <EmptyLinks
        visible={
          !data.associationsQuery.isPending &&
          !data.associationsQuery.isError &&
          data.associations.length === 0
        }
      />
    </>
  );
}

function DocumentGroups({
  data,
  onUnlink,
  busy,
}: {
  data: TripDocumentData;
  onUnlink: (id: number) => void;
  busy: boolean;
}): ReactElement {
  return (
    <>
      <DocumentGroup
        title="Trip documents"
        associations={data.groups.trip}
        originals={data.originalRows}
        allAssociations={data.associations}
        onUnlink={onUnlink}
        busy={busy}
      />
      {data.groups.visits.map((visit) => (
        <VisitDocumentGroups
          key={visit.visitId}
          visitId={visit.visitId}
          data={data}
          onUnlink={onUnlink}
          busy={busy}
        />
      ))}
      {data.groups.targets.map((group) => (
        <DocumentGroup
          key={`${group.target.kind}:${String(group.target.id)}`}
          title={groupTitle(group.target, data.targetNames)}
          associations={group.associations}
          originals={data.originalRows}
          allAssociations={data.associations}
          onUnlink={onUnlink}
          busy={busy}
        />
      ))}
    </>
  );
}

function VisitDocumentGroups({
  visitId,
  data,
  onUnlink,
  busy,
}: {
  visitId: number;
  data: TripDocumentData;
  onUnlink: (id: number) => void;
  busy: boolean;
}): ReactElement {
  const visitName = documentTargetLabel({ kind: 'visit', id: visitId }, data.targetNames);
  const group = data.groups.visits.find((item) => item.visitId === visitId);
  return (
    <section aria-label={visitName} className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{visitName}</h2>
      {group?.targets.map((target) => (
        <DocumentGroup
          key={`${target.target.kind}:${String(target.target.id)}`}
          title={groupTitle(target.target, data.targetNames)}
          associations={target.associations}
          originals={data.originalRows}
          allAssociations={data.associations}
          onUnlink={onUnlink}
          busy={busy}
        />
      ))}
    </section>
  );
}

function groupTitle(
  target: DocumentAssociationTarget,
  names: Map<string, TripDocumentTargetRecord>
): string {
  const resolved = documentTargetLabel(target, names);
  if (target.kind === 'visit') return 'Visit documents';
  const kind = target.kind[0]?.toUpperCase() + target.kind.slice(1);
  return `${kind} · ${resolved}`;
}

function LinkLoading({ pending }: { pending: boolean }): ReactElement | null {
  return pending ? <p role="status">Loading trip documents…</p> : null;
}

function LinkLoadError({
  query,
}: {
  query: UseQueryResult<TripDocumentAssociation[], Error>;
}): ReactElement | null {
  return query.isError ? (
    <div role="alert" className="flex flex-col gap-2">
      <p className="text-sm text-destructive">Trip document links could not be loaded.</p>
      <Button variant="outline" onClick={() => void query.refetch()}>
        Retry
      </Button>
    </div>
  ) : null;
}

function UnlinkError({ visible }: { visible: boolean }): ReactElement | null {
  return visible ? (
    <p role="alert" className="text-sm text-destructive">
      The Trips link could not be removed. The Documents original was not changed.
    </p>
  ) : null;
}

function RouteOrderError({ visible }: { visible: boolean }): ReactElement | null {
  return visible ? (
    <p role="status" className="text-sm text-muted-foreground">
      Route order is unavailable. Visit links remain grouped by their explicit target identities.
    </p>
  ) : null;
}

function EmptyLinks({ visible }: { visible: boolean }): ReactElement | null {
  return visible ? (
    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      No trip documents are linked yet.
    </p>
  ) : null;
}
