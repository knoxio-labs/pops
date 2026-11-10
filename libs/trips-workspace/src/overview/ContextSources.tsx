import { dateRange } from './model';
import { sourceAction } from './source-action';
import { SourceCard } from './SourceCard';

import type { JSX } from 'react';

import type { Capture, CaptureSource } from '../capture/types';
import type { MeetingPlan } from '../people/types';
import type { OverviewSources, OverviewViewProps } from './types';

/** Presentation references retain each canonical source, including independent equal numeric IDs. */
export type OverviewContextRecord =
  | { kind: 'meeting'; source: MeetingPlan }
  | { kind: 'capture'; source: Capture }
  | { kind: 'idea'; source: CaptureSource['ideas'][number] };

/** Present only live rows belonging to the selected Trip, without interpreting Capture classifications. */
export function contextRecords(sources: OverviewSources, tripId: number): OverviewContextRecord[] {
  return [
    ...(sources.meetings ?? [])
      .filter((source) => source.tripId === tripId && !source.removed)
      .map((source) => ({ kind: 'meeting' as const, source })),
    ...(sources.capture?.captures ?? [])
      .filter((source) => source.tripId === tripId && source.removedAt === null)
      .map((source) => ({ kind: 'capture' as const, source })),
    ...(sources.capture?.ideas ?? [])
      .filter((source) => source.tripId === tripId && source.removedAt === null)
      .map((source) => ({ kind: 'idea' as const, source })),
  ];
}

/** Contextual cards open the existing owning editor; they never infer availability or organise sources. */
export function ContextSources(
  props: OverviewViewProps & { records: OverviewContextRecord[] }
): JSX.Element[] {
  return props.records.map((record) => {
    const { source } = record;
    const facts = contextFacts(record, props);
    const explored =
      record.kind !== 'meeting' &&
      props.sources.capture?.memberships.some(
        (membership) =>
          membership.removedAt === null &&
          membership.tripId === props.tripId &&
          membership.source.kind === record.kind &&
          membership.source.id === source.id
      );
    return (
      <SourceCard
        key={`${record.kind}:${source.id}`}
        kind={record.kind}
        title={facts.title}
        {...sourceAction(props, { kind: record.kind, id: source.id })}
        statuses={[...facts.statuses, ...(explored ? ['explore'] : [])]}
        labels={props.labels}
      >
        {facts.timing && <span className="block">{facts.timing}</span>}
        {source.notes && <span className="block whitespace-pre-wrap">{source.notes}</span>}
        {record.kind === 'meeting' && record.source.contactUri && (
          <span className="block">{record.source.contactUri}</span>
        )}
        {record.kind === 'capture' && record.source.originalUrl && (
          <span className="block">{record.source.originalUrl}</span>
        )}
      </SourceCard>
    );
  });
}

function contextFacts(
  record: OverviewContextRecord,
  props: OverviewViewProps
): { title: string; statuses: (string | null)[]; timing: string | undefined } {
  switch (record.kind) {
    case 'meeting':
      return {
        title: record.source.title ?? props.labels.source('meeting', record.source.id),
        statuses: [record.source.intention, record.source.agreement],
        timing: dateRange(
          record.source.startDate ?? undefined,
          record.source.endDate ?? undefined,
          props.locale
        ),
      };
    case 'capture':
      return {
        title:
          record.source.title ??
          (record.source.originalText || props.labels.source('capture', record.source.id)),
        statuses: [record.source.classification],
        timing: undefined,
      };
    case 'idea':
      return {
        title: record.source.name ?? props.labels.source('idea', record.source.id),
        statuses: [record.source.status],
        timing: ideaTiming(record.source, props.locale),
      };
  }
}

function ideaTiming(source: CaptureSource['ideas'][number], locale: string): string | undefined {
  if (source.timing.mode === 'dates')
    return dateRange(source.timing.from, source.timing.to, locale);
  return source.timing.mode === 'month' ? source.timing.month : undefined;
}
