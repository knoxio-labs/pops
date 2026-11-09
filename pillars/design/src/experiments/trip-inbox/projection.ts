import { normalizeSearchText } from '../../fixtures/search-text';
import { presentTripRecord } from '../../fixtures/trip-overview-format';
import { captureLabel } from '../trip-quick-capture/model';

import type { TripRecord } from '../../fixtures/trip-overview-model';
import type { InboxFilters, InboxRow, InboxState } from './types';

/** Resolves explicit titles or approved source endpoint labels without parsing captured material. */
export function inboxTargetLabel(state: InboxState, target: TripRecord): string {
  return target.title ?? presentTripRecord({ ...target, schedule: undefined }, state.targets).title;
}

function sourceFindings(state: InboxState, row: InboxRow): InboxRow['findings'] {
  const findings: InboxRow['findings'] = [];
  if (!row.source)
    findings.push({ id: 'missing-source', message: 'The captured source is unavailable.' });
  if (
    row.source?.visitId &&
    !state.targets.some((target) => target.id === row.source?.visitId && target.kind === 'city')
  )
    findings.push({
      id: 'missing-source-visit',
      message: 'The captured visit reference is unavailable.',
    });
  for (const { association, target } of row.associations) {
    if (!target) findings.push({ id: association.id, message: 'The linked item is unavailable.' });
    if (
      target?.visitId &&
      !state.targets.some((visit) => visit.id === target.visitId && visit.kind === 'city')
    )
      findings.push({
        id: `visit-${association.id}`,
        message: 'A linked item’s visit reference is unavailable.',
      });
  }
  return findings;
}

/** Resolves a current source outside active list filters, including orphaned associations without substituting another source. */
export function inboxSourceRow(state: InboxState, id: string): InboxRow | null {
  const source = state.capture.items.find((item) => item.id === id);
  const associations = state.associations
    .filter((association) => association.sourceId === id)
    .map((association) => {
      const target = state.targets.find((entry) => entry.id === association.targetId);
      return {
        association,
        target,
        label: target ? inboxTargetLabel(state, target) : 'Item unavailable',
      };
    });
  if (!source && !associations.length) return null;
  const validAssociationCount = source
    ? associations.filter((entry) => entry.target !== undefined).length
    : 0;
  const row: InboxRow = {
    id,
    source,
    label: source ? captureLabel(source) : 'Source unavailable',
    associations,
    validAssociationCount,
    organised: validAssociationCount > 0,
    findings: [],
  };
  return { ...row, findings: sourceFindings(state, row) };
}

function rowSearchFacts(row: InboxRow): string[] {
  const source = row.source;
  const material = source
    ? [
        source.title,
        source.text,
        source.url,
        source.kind ?? '',
        ...source.files.map((file) => file.name),
      ]
    : [];
  const targets = row.associations.flatMap((entry) =>
    entry.target ? [entry.label, entry.target.notes] : []
  );
  return [...material, ...targets];
}

/** Filters actual captured material and associated target facts; orphaned references remain visible in the unorganised set. */
export function inboxRows(state: InboxState, filters: InboxFilters): InboxRow[] {
  const ids = [
    ...new Set([
      ...state.capture.items.map((source) => source.id),
      ...state.associations.map((entry) => entry.sourceId),
    ]),
  ];
  const query = normalizeSearchText(filters.query.trim());
  return ids.flatMap((id) => {
    const row = inboxSourceRow(state, id);
    if (!row) return [];
    if (filters.organisation === 'organised' && !row.organised) return [];
    if (filters.organisation === 'unorganised' && row.organised) return [];
    const visit = state.targets.find(
      (target) => target.kind === 'city' && target.id === row.source?.visitId
    );
    const facts = [...rowSearchFacts(row), visit ? inboxTargetLabel(state, visit) : ''];
    return facts.some((value) => normalizeSearchText(value).includes(query)) ? [row] : [];
  });
}
