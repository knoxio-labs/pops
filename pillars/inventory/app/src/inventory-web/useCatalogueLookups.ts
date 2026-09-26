import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../inventory-api-helpers.js';
import { typesReadCatalogue } from '../inventory-api/index.js';
import { PUBLISHED_CATALOGUE_QUERY_KEY } from './queryKeys.js';

import type { TypesReadCatalogueResponses } from '../inventory-api/types.gen.js';

/** The published catalogue response shared by the editor and web data layer. */
export type CatalogueDescriptor = TypesReadCatalogueResponses[200];

/** One published catalogue type. */
export type CatalogueType = CatalogueDescriptor['types'][number];

const EMPTY_TYPES: readonly CatalogueType[] = [];

/** Published catalogue data and stable id-to-type/name lookup maps. */
export interface CatalogueLookups {
  readonly catalogue: CatalogueDescriptor | undefined;
  readonly types: readonly CatalogueType[];
  readonly typeById: ReadonlyMap<string, CatalogueType>;
  readonly typeNameById: ReadonlyMap<string, string>;
  readonly typeForId: (id: string | null | undefined) => CatalogueType | null;
  readonly typeNameForId: (id: string | null | undefined) => string | null;
  readonly isPending: boolean;
  readonly error: unknown | null;
}

/** Reads the published catalogue through the cache key shared with the editor. */
export function useCatalogue() {
  return useQuery({
    queryKey: PUBLISHED_CATALOGUE_QUERY_KEY,
    queryFn: async () => unwrap(await typesReadCatalogue()),
  });
}

/** Provides the published catalogue and lookup helpers for web item mappers. */
export function useCatalogueLookups(): CatalogueLookups {
  const catalogueQuery = useCatalogue();
  const types = catalogueQuery.data?.types ?? EMPTY_TYPES;
  const typeById = useMemo(() => new Map(types.map((type) => [type.id, type] as const)), [types]);
  const typeNameById = useMemo(
    () => new Map(types.map((type) => [type.id, type.label] as const)),
    [types]
  );

  return {
    catalogue: catalogueQuery.data,
    types,
    typeById,
    typeNameById,
    typeForId: (id) => (id === null || id === undefined ? null : (typeById.get(id) ?? null)),
    typeNameForId: (id) =>
      id === null || id === undefined ? null : (typeNameById.get(id) ?? null),
    isPending: catalogueQuery.isPending,
    error: catalogueQuery.error,
  };
}

/** Adds one selected type to the shared catalogue lookup result. */
export function useTypeLookup(typeId: string | null | undefined) {
  const lookups = useCatalogueLookups();

  return {
    ...lookups,
    type: lookups.typeForId(typeId),
    typeName: lookups.typeNameForId(typeId),
  };
}
