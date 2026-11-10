import type {
  ArrangementFilters,
  ArrangementGroup,
  ArrangementRow,
  ArrangementSources,
  ArrangementTarget,
} from './types';

/** Retain complete source identities without deriving Visit placement from places, dates or endpoints. */
export function arrangementRows(sources: ArrangementSources): ArrangementRow[] {
  return [
    ...(sources.stays ?? []).map((source): ArrangementRow => ({
      kind: 'stay',
      source,
      visitId: source.visitId,
    })),
    ...(sources.events ?? []).map((source): ArrangementRow => ({
      kind: 'event',
      source,
      visitId: source.visitId,
    })),
    ...(sources.rentals ?? []).map((source): ArrangementRow => ({
      kind: 'rental',
      source,
      visitId: source.pickupVisitId,
    })),
    ...(sources.journeys ?? []).map((source): ArrangementRow => ({
      kind: 'journey',
      source,
      legs: sources.legs.get(source.id),
      visitId: null,
    })),
  ];
}
/** Exact identity for responsibility and canonical source controls. */
export function arrangementTarget(row: ArrangementRow): ArrangementTarget {
  return { targetKind: row.kind, targetId: row.source.id };
}
/** One card per source; known occurrences follow persisted Visit order, unresolved references stay visible. */
export function groupArrangements(
  rows: ArrangementRow[],
  visits: ArrangementSources['visits']
): ArrangementGroup[] {
  const groups: ArrangementGroup[] = (visits ?? []).map((visit) => ({
    id: `visit:${visit.id}`,
    visit,
    rows: [],
  }));
  for (const row of rows) {
    const id = row.kind === 'journey' ? 'journeys' : `visit:${row.visitId ?? 'unset'}`;
    let group = groups.find((candidate) => candidate.id === id);
    if (!group) {
      group = {
        id,
        rows: [],
        ...(row.visitId === null ? {} : { unavailableVisitId: row.visitId }),
      };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}
/** A purchase filter can inspect only explicit source flags; no whole-Journey purchase is invented. */
export function purchased(row: ArrangementRow): boolean {
  if (row.kind === 'journey') return false;
  if (row.kind === 'event') return row.source.purchase === 'Purchased';
  return row.source.status === 'Purchased';
}
/** Search source facts only, retaining original objects and independent filter selections. */
export function filterArrangements(
  rows: ArrangementRow[],
  filters: ArrangementFilters,
  sources: ArrangementSources
): ArrangementRow[] {
  const query = normalize(filters.query.trim());
  return rows.filter((row) => {
    if (filters.kind && row.kind !== filters.kind) return false;
    const flags =
      row.kind === 'journey'
        ? row.legs?.map((leg) => leg.purchase === 'Purchased')
        : [purchased(row)];
    if (filters.purchase === 'purchased' && !flags?.includes(true)) return false;
    if (filters.purchase === 'not-purchased' && !flags?.includes(false)) return false;
    return facts(row, sources).some((value) => normalize(value).includes(query));
  });
}
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();
}
function facts(row: ArrangementRow, sources: ArrangementSources): string[] {
  const visit = sources.visits?.find((candidate) => candidate.id === row.visitId);
  const place = sources.places?.find((candidate) => candidate.id === visit?.placeId);
  const responsibility = sources.responsibilities?.find(
    (candidate) => candidate.targetKind === row.kind && candidate.targetId === row.source.id
  )?.responsibility;
  return [
    place?.name,
    responsibility?.kind === 'contact' ? responsibility.uri : undefined,
    ...sourceFacts(row),
  ].filter((value): value is string => typeof value === 'string');
}
function sourceFacts(row: ArrangementRow): (string | null | undefined)[] {
  switch (row.kind) {
    case 'stay':
      return [
        row.source.name,
        row.source.status,
        row.source.notes,
        row.source.address,
        row.source.reference,
        ...Object.values(row.source.timing),
      ];
    case 'event':
      return [
        row.source.name,
        row.source.intention,
        row.source.arrangement,
        row.source.purchase,
        row.source.notes,
        ...Object.values(row.source.timing),
      ];
    case 'rental':
      return [row.source.provider, row.source.start, row.source.end, row.source.status];
    case 'journey':
      return [
        row.source.name,
        row.source.notes,
        ...(row.legs ?? []).flatMap((leg) => [
          leg.mode,
          leg.intention,
          leg.arrangement,
          leg.purchase,
          leg.from.sourceLabel,
          leg.to.sourceLabel,
          leg.from.local,
          leg.to.local,
          leg.operator,
          leg.service,
          leg.notes,
        ]),
      ];
  }
}
