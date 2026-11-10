import type { Visit } from '../stay/types';
import type { ArrangementLabels, ArrangementRow, ArrangementSources } from './types';

/** Actual ordered Visit occurrence labels never expose database IDs or join sources by matching display names. */
export function visitTitle(
  visit: Visit,
  sources: ArrangementSources,
  labels: ArrangementLabels
): string {
  const place = sources.places?.find((candidate) => candidate.id === visit.placeId);
  const index = sources.visits?.findIndex((candidate) => candidate.id === visit.id) ?? -1;
  const name = place?.name ?? labels.placeUnavailable;
  return index < 0 ? name : `${name} · ${labels.visit} ${index + 1}`;
}

/** Source-owned display text with a translated kind fallback, without promoting a technical identity into a title. */
export function arrangementTitle(row: ArrangementRow, labels: ArrangementLabels): string {
  const name = row.kind === 'rental' ? row.source.provider : row.source.name;
  return name ?? labels[row.kind];
}
