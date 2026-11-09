import { normalizeSearchText } from '../../fixtures/search-text';

import type { DocumentLink } from '../trip-document-linking/model';
import type {
  DocumentRow,
  TripDocumentFilters,
  TripDocumentOccurrence,
  TripDocumentsState,
} from './types';

function linkedFacts(state: TripDocumentsState, links: DocumentLink[]): string[] {
  return links.flatMap((link) => {
    const target = state.linking.targets.find((entry) => entry.id === link.targetId);
    const visits = state.targetVisits
      .filter((entry) => entry.targetId === link.targetId)
      .flatMap((entry) => {
        const visit = state.visits.find((source) => source.id === entry.visitId);
        return visit ? [visit.name] : [];
      });
    return [target?.label ?? '', ...visits];
  });
}

function rowFacts(state: TripDocumentsState, row: DocumentRow): string[] {
  const document = row.document;
  const metadata = document
    ? [document.title, document.fileName, document.mimeType, document.availability]
    : [];
  const offline = row.offline ? [row.offline.status, row.offline.source, row.offline.detail] : [];
  return [
    ...metadata,
    ...offline,
    row.provenance?.source ?? '',
    row.provenance?.url ?? '',
    ...linkedFacts(state, row.links),
  ];
}

/** Resolve one original identity and its current associations, including an unlinked or unavailable source. */
export function sourceRow(state: TripDocumentsState, id: string): DocumentRow {
  const document = state.linking.documents.find((entry) => entry.id === id);
  const offline = state.offline.find((entry) => entry.documentId === id);
  return {
    id,
    document,
    title: document ? document.title || document.fileName : 'Document unavailable',
    links: state.linking.links.filter((link) => link.documentId === id),
    offline,
    provenance: state.provenance.find((entry) => entry.documentId === id),
  };
}

function matchesFilters(row: DocumentRow, filters: TripDocumentFilters): boolean {
  const source = row.document?.availability ?? 'unknown';
  const offline = row.offline?.status ?? 'unknown';
  return (
    (!filters.mimeType || row.document?.mimeType === filters.mimeType) &&
    (filters.source === 'all' || source === filters.source) &&
    (filters.offline === 'all' || offline === filters.offline)
  );
}

/** Projects explicitly trip-linked originals once per source identity, including unresolved referenced originals. */
export function documentRows(
  state: TripDocumentsState,
  filters: TripDocumentFilters
): DocumentRow[] {
  const ids = [...new Set(state.linking.links.map((link) => link.documentId))];
  const query = normalizeSearchText(filters.query.trim());
  return ids.flatMap((id): DocumentRow[] => {
    const row = sourceRow(state, id);
    if (!matchesFilters(row, filters)) return [];
    return rowFacts(state, row).some((value) => normalizeSearchText(value).includes(query))
      ? [row]
      : [];
  });
}

/** Expands explicit target-to-visit associations while retaining each occurrence's exact original row and link. */
export function documentOccurrences(
  state: TripDocumentsState,
  rows: DocumentRow[]
): TripDocumentOccurrence[] {
  return rows.flatMap((row) => {
    return row.links.flatMap((link) => {
      const target = state.linking.targets.find((entry) => entry.id === link.targetId);
      const associations = state.targetVisits.filter((entry) => entry.targetId === link.targetId);
      if (!associations.length)
        return [{ id: link.id, row, link, target, visitId: '', visitLabel: '' }];
      return associations.map((association) => ({
        id: `${link.id}:${association.id}`,
        row,
        link,
        target,
        visitId: association.visitId,
        visitLabel:
          state.visits.find((visit) => visit.id === association.visitId)?.name ??
          'Visit unavailable',
      }));
    });
  });
}

function occurrenceGroup(occurrence: TripDocumentOccurrence): { id: string; name: string } {
  if (occurrence.target?.kind === 'trip') return { id: 'trip', name: 'Trip documents' };
  if (occurrence.visitId) return { id: occurrence.visitId, name: occurrence.visitLabel };
  if (!occurrence.target)
    return { id: `missing:${occurrence.link.targetId}`, name: 'Target unavailable' };
  return { id: 'no-visit', name: 'No visit selected' };
}

/** Places trip-wide originals first, then references in route order, retaining original identities. */
export function groupDocumentOccurrences(
  state: TripDocumentsState,
  occurrences: TripDocumentOccurrence[]
): { id: string; name: string; occurrences: TripDocumentOccurrence[] }[] {
  const groups = new Map<
    string,
    { id: string; name: string; occurrences: TripDocumentOccurrence[] }
  >();
  for (const occurrence of occurrences) {
    const identity = occurrenceGroup(occurrence);
    const group = groups.get(identity.id) ?? { ...identity, occurrences: [] };
    group.occurrences.push(occurrence);
    groups.set(identity.id, group);
  }
  return [...groups.values()].toSorted((left, right) => {
    const tripOrder = Number(right.id === 'trip') - Number(left.id === 'trip');
    if (tripOrder) return tripOrder;
    const a = state.visits.findIndex((visit) => visit.id === left.id);
    const b = state.visits.findIndex((visit) => visit.id === right.id);
    if (a === b) return 0;
    if (a < 0) return 1;
    if (b < 0) return -1;
    return a - b;
  });
}

/** Reports broken selected endpoints while keeping every association removable and the original source untouched. */
export function tripDocumentFindings(
  state: TripDocumentsState,
  row: DocumentRow
): { id: string; message: string }[] {
  const findings: { id: string; message: string }[] = [];
  if (!row.document)
    findings.push({ id: 'missing-document', message: 'The original document is unavailable.' });
  for (const link of row.links) {
    if (!state.linking.targets.some((target) => target.id === link.targetId))
      findings.push({ id: link.id, message: 'The linked target is unavailable.' });
    for (const association of state.targetVisits.filter(
      (entry) => entry.targetId === link.targetId
    )) {
      if (!state.visits.some((visit) => visit.id === association.visitId))
        findings.push({ id: association.id, message: 'The linked route visit is unavailable.' });
    }
  }
  return findings;
}
