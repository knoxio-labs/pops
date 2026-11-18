import {
  routeDraftFingerprint,
  routeDraftRecordFacts,
  routeDraftRecordSource,
  routeDraftSourceKey,
} from './route-draft-records.js';
import { relatedVisitIds, sharedSourceIdentities } from './route-draft-source-relations.js';
import { TripsServiceError } from './source-record.js';

import type {
  RouteDraftCandidate,
  RouteDraftPreviewInput,
  RouteDraftSource,
} from '../../contract/route-draft-schemas.js';
import type { RoutePath } from '../../contract/route-schemas.js';
import type { RouteDraftRecord } from '../schema/route-draft-types.js';
import type { RouteDraftSnapshot } from './route-draft-snapshot.js';

type Reason = RouteDraftCandidate['reasons'][number];
type CandidateFacts = ReturnType<typeof routeDraftRecordFacts>;

type SourceSelection = {
  selection: RouteDraftSource[];
  selected: Set<string>;
  available: Set<string>;
};

type DeletionContext = {
  records: RouteDraftRecord[];
  facts: Map<string, CandidateFacts>;
  shared: Set<string>;
  selection: SourceSelection;
};

function selectSources(
  records: RouteDraftRecord[],
  facts: Map<string, CandidateFacts>,
  shared: Set<string>,
  input: RouteDraftPreviewInput
): SourceSelection {
  const defaults = records
    .filter((record) => {
      const key = routeDraftSourceKey(routeDraftRecordSource(record));
      return !facts.get(key)?.confirmed && !shared.has(key);
    })
    .map(routeDraftRecordSource);
  const selection = (input.deleteSources ?? defaults).toSorted((left, right) =>
    routeDraftSourceKey(left).localeCompare(routeDraftSourceKey(right))
  );
  const selected = new Set(selection.map(routeDraftSourceKey));
  const available = new Set(
    records.map((record) => routeDraftSourceKey(routeDraftRecordSource(record)))
  );
  if (selected.size !== selection.length || [...selected].some((key) => !available.has(key))) {
    throw new TripsServiceError('route_draft_conflict');
  }
  return { selection, selected, available };
}

function retain(
  retained: Map<string, Set<Reason>>,
  available: Set<string>,
  key: string,
  reason: Reason
): boolean {
  if (!available.has(key)) return false;
  const reasons = retained.get(key) ?? new Set<Reason>();
  const changed = !reasons.has(reason);
  reasons.add(reason);
  retained.set(key, reasons);
  return changed;
}

function seedRetentions(
  snapshot: RouteDraftSnapshot,
  context: DeletionContext
): Map<string, Set<Reason>> {
  const retained = new Map<string, Set<Reason>>();
  for (const record of context.records) {
    const key = routeDraftSourceKey(routeDraftRecordSource(record));
    if (context.facts.get(key)?.confirmed)
      retain(retained, context.selection.available, key, 'confirmed');
    if (context.shared.has(key)) retain(retained, context.selection.available, key, 'shared');
    if (!context.selection.selected.has(key))
      retain(retained, context.selection.available, key, 'not-selected');
  }
  for (const source of [...snapshot.captures, ...snapshot.ideas]) {
    if (source.removedAt === null && source.visitId !== null) {
      retain(retained, context.selection.available, `visit:${source.visitId}`, 'context');
    }
  }
  return retained;
}

function propagateRetentions(context: DeletionContext, retained: Map<string, Set<Reason>>): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of context.records) {
      const key = routeDraftSourceKey(routeDraftRecordSource(record));
      if (record.kind === 'journey-leg' && context.shared.has(`journey:${record.row.journeyId}`)) {
        changed = retain(retained, context.selection.available, key, 'shared') || changed;
      }
      if (!retained.has(key)) continue;
      if (record.kind === 'journey-leg') {
        changed =
          retain(
            retained,
            context.selection.available,
            `journey:${record.row.journeyId}`,
            'context'
          ) || changed;
      }
      for (const id of relatedVisitIds(record)) {
        changed =
          retain(retained, context.selection.available, `visit:${id}`, 'context') || changed;
      }
    }
  }
}

function retainedSources(
  snapshot: RouteDraftSnapshot,
  context: DeletionContext
): Map<string, Set<Reason>> {
  const retained = seedRetentions(snapshot, context);
  propagateRetentions(context, retained);
  return retained;
}

function candidatesForDeletion(
  context: DeletionContext,
  retained: Map<string, Set<Reason>>
): RouteDraftCandidate[] {
  return context.records.map((record) => {
    const source = routeDraftRecordSource(record);
    const key = routeDraftSourceKey(source);
    const value = context.facts.get(key);
    if (value === undefined) throw new TripsServiceError('route_draft_conflict');
    return {
      source,
      version: routeDraftFingerprint(record),
      confirmed: value.confirmed,
      selected: context.selection.selected.has(key),
      disposition: retained.has(key) ? 'retain' : 'remove',
      reasons: [...(retained.get(key) ?? [])].toSorted(),
      facts: value.facts,
    };
  });
}

/** Resolve default or explicit deletion selection and preservation reasons for a route path. */
export function planDeletionSources(
  snapshot: RouteDraftSnapshot,
  records: RouteDraftRecord[],
  path: RoutePath,
  input: RouteDraftPreviewInput
): { candidates: RouteDraftCandidate[]; selection: RouteDraftSource[] } {
  const facts = new Map(
    records.map((record) => [
      routeDraftSourceKey(routeDraftRecordSource(record)),
      routeDraftRecordFacts(record),
    ])
  );
  const shared = sharedSourceIdentities(snapshot, path);
  const selection = selectSources(records, facts, shared, input);
  const context = { records, facts, shared, selection };
  const retained = retainedSources(snapshot, context);
  return { candidates: candidatesForDeletion(context, retained), selection: selection.selection };
}
