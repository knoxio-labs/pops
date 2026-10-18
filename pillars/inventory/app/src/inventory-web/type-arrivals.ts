import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import { typesReadCatalogue, webTypeArrivalCounts } from '../inventory-api/index.js';
import { WEB_ITEMS_QUERY_KEY } from './queryKeys.js';
import { usePublishedCatalogue } from './useCatalogueLookups.js';

import type { WebTypeArrivalCountsResponses } from '../inventory-api/types.gen.js';
import type { CatalogueType } from './useCatalogueLookups.js';

/** The local-storage key for browser-local Type arrived dismissals. */
export const TYPE_ARRIVED_DISMISSED_KEY = 'pops.inventory.type-arrived.dismissed';

/** Dismissed type ids; an empty or unreadable store produces an empty list. */
export function readDismissedTypes(): string[] {
  try {
    const raw = localStorage.getItem(TYPE_ARRIVED_DISMISSED_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

/** Adds a type id to the browser-local dismissal list, ignoring storage failures. */
export function dismissType(typeId: string): void {
  try {
    const dismissed = readDismissedTypes();
    if (dismissed.includes(typeId)) return;
    localStorage.setItem(TYPE_ARRIVED_DISMISSED_KEY, JSON.stringify([...dismissed, typeId]));
  } catch {
    return;
  }
}

/** A type as the base revision had it: only the fields used to detect arrival. */
export interface BaseType {
  id: string;
  legacyLabels: readonly string[];
}

function normalise(label: string): string {
  return label.trim().toLowerCase();
}

function gainedLegacyLabel(type: CatalogueType, baseType: BaseType | undefined): boolean {
  if (baseType === undefined) return true;
  const previousLabels = new Set(baseType.legacyLabels.map(normalise));
  return type.legacyLabels.some((label) => {
    const normalized = normalise(label);
    return normalized !== '' && !previousLabels.has(normalized);
  });
}

/**
 * Returns active, labelled and undismissed types that are new against `base`,
 * preserving catalogue sort order. A null base makes every current type new.
 */
export function arrivalCandidates(
  types: readonly CatalogueType[],
  base: readonly BaseType[] | null,
  dismissed: readonly string[]
): CatalogueType[] {
  const dismissedIds = new Set(dismissed);
  const baseById = new Map((base ?? []).map((type) => [type.id, type] as const));
  return types
    .filter(
      (type) =>
        type.archivedAt === null &&
        type.legacyLabels.some((label) => label.trim() !== '') &&
        !dismissedIds.has(type.id) &&
        (base === null || gainedLegacyLabel(type, baseById.get(type.id)))
    )
    .toSorted(
      (left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)
    );
}

/** Returns the React Query key for one immutable historical catalogue revision. */
export function baseCatalogueQueryKey(
  revision: number
): readonly ['inventory', 'type-catalogue', 'revision', number] {
  return ['inventory', 'type-catalogue', 'revision', revision];
}

/** One candidate type and its server-side count of matching untyped items. */
export interface TypeArrival {
  type: CatalogueType;
  matches: number;
}

/** The first Type arrived prompt that is ready to show on the Items page. */
export interface TypeArrivals {
  arrival: TypeArrival | null;
  dismiss: (typeId: string) => void;
}

function useBaseCatalogue(baseRevision: number | null): readonly BaseType[] | null {
  const query = useQuery({
    queryKey:
      baseRevision === null
        ? (['inventory', 'type-catalogue', 'revision', 'none'] as const)
        : baseCatalogueQueryKey(baseRevision),
    enabled: baseRevision !== null,
    staleTime: Infinity,
    queryFn: async () => {
      if (baseRevision === null) throw new Error('base catalogue revision is unavailable');
      return unwrap(await typesReadCatalogue({ query: { revision: baseRevision } }));
    },
  });

  return useMemo(() => {
    if (baseRevision === null || query.data === undefined) return null;
    return query.data.types.map(({ id, legacyLabels }) => ({ id, legacyLabels }));
  }, [baseRevision, query.data]);
}

function useArrivalCounts(
  candidates: readonly CatalogueType[],
  revision: number | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: [
      ...WEB_ITEMS_QUERY_KEY,
      'type-arrival',
      revision,
      candidates.map((type) => type.key),
    ] as const,
    enabled,
    staleTime: Infinity,
    queryFn: async ({ signal }) => unwrap(await webTypeArrivalCounts({ signal })),
  });
}

function firstArrival(
  candidates: readonly CatalogueType[],
  query: {
    isPending: boolean;
    isError: boolean;
    data: WebTypeArrivalCountsResponses[200] | undefined;
  }
): TypeArrival | null {
  if (query.isPending || query.isError || query.data === undefined) return null;
  for (const type of candidates) {
    const matches = query.data.counts[type.key];
    if (matches === undefined) return null;
    if (matches > 0) return { type, matches };
  }
  return null;
}

/** Finds the first new type with server-side matches and remembers dismissals locally. */
export function useTypeArrival(): TypeArrivals {
  const catalogue = usePublishedCatalogue();
  const [dismissed, setDismissed] = useState(readDismissedTypes);
  const catalogueReady =
    catalogue.catalogue !== undefined && !catalogue.isPending && catalogue.error === null;
  const baseRevision = catalogueReady ? catalogue.baseRevision : null;
  const base = useBaseCatalogue(baseRevision);
  const candidates = useMemo(() => {
    if (!catalogueReady || (baseRevision !== null && base === null)) return [];
    return arrivalCandidates(catalogue.types, base, []);
  }, [base, baseRevision, catalogue.types, catalogueReady]);
  const visibleCandidates = useMemo(
    () => candidates.filter((type) => !dismissed.includes(type.id)),
    [candidates, dismissed]
  );
  const matchQuery = useArrivalCounts(candidates, catalogue.revision, visibleCandidates.length > 0);
  const arrival = firstArrival(visibleCandidates, matchQuery);
  const dismiss = useCallback((typeId: string) => {
    setDismissed((current) => (current.includes(typeId) ? current : [...current, typeId]));
    dismissType(typeId);
  }, []);

  return { arrival, dismiss };
}
