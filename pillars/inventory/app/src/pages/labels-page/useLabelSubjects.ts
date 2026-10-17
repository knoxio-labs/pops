/**
 * The items a label job prints, read from the new item model
 * (`GET /web/items?ids=`), with what each listed box holds and a suggested
 * code for every item that has none (`POST /codes/suggest`).
 */
import { keepPreviousData, useIsFetching, useQueries, useQuery } from '@tanstack/react-query';

import { unwrap } from '../../inventory-api-helpers.js';
import { codesSuggest } from '../../inventory-api/index.js';
import { INVENTORY_SYNC_PROTOCOL } from '../../inventory-web/mutation-client.js';
import {
  PUBLISHED_CATALOGUE_QUERY_KEY,
  WEB_ITEMS_QUERY_KEY,
} from '../../inventory-web/queryKeys.js';
import { usePublishedCatalogue } from '../../inventory-web/useCatalogueLookups.js';
import { compareInventoryNames } from '../../lib/sort-names.js';
import { detailsFor } from './label-details.js';
import { treeFragility } from './label-fragility.js';
import { listLabelItems } from './label-subject-reads.js';

import type { LabelDetails, PrintSubject } from '@pops/inventory/labels';

import type { WebListResponses } from '../../inventory-api/types.gen.js';
import type { LabelFragility } from './label-fragility.js';

/** One item as `GET /web/items` returns it. */
export type WebItem = WebListResponses[200]['items'][number];

/** A job's item, with what the page needs beyond its label: revision and type. */
export interface LabelSubject extends PrintSubject {
  revision: number;
  typeKey: string | null;
}

/** The query key prefix for code suggestions, so a saved code can refresh them. */
export const CODE_SUGGESTION_QUERY_KEY = ['inventory', 'web', 'code-suggestion'] as const;

/** An item as the label page prints it; the suggestion is filled in separately. */
export function toLabelSubject(item: WebItem, suggestedCode: string | null = null): LabelSubject {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    suggestedCode: item.code === null ? suggestedCode : null,
    kind: item.isContainer ? 'container' : 'item',
    place: null,
    quantity: item.quantity,
    revision: item.revision,
    typeKey: item.typeKey,
  };
}

async function suggestCode(item: WebItem): Promise<string | null> {
  const result = unwrap(
    await codesSuggest({
      body: { name: item.name, ...(item.typeKey ? { typeKey: item.typeKey } : {}) },
      headers: { 'pops-inventory-protocol': INVENTORY_SYNC_PROTOCOL },
    })
  );
  return result.suggestions[0] ?? null;
}

/** The job's items in the order asked for, with the ids that matched no live item. */
export interface LabelSubjects {
  /** True until the listed items first arrive. */
  isLoading: boolean;
  /** True while selected items, contents, descendants, or the catalogue refresh. */
  contentsLoading: boolean;
  error: Error | null;
  subjects: LabelSubject[];
  /** Ids asked for that are not live items: deleted, discarded, or never existed. */
  missing: string[];
  /** What each box in the job holds, by the box's id. */
  contents: ReadonlyMap<string, LabelSubject[]>;
  /** Fragility from each selected item and its full contained tree. */
  fragility: ReadonlyMap<string, LabelFragility>;
  /** Field values and box contents available to the label-content picker. */
  details: ReadonlyMap<string, LabelDetails>;
}

function useContents(items: WebItem[]) {
  const boxes = items.filter((item) => item.isContainer);
  const results = useQueries({
    queries: boxes.map((box) => ({
      queryKey: [...WEB_ITEMS_QUERY_KEY, 'label-contents', box.id] as const,
      queryFn: () => listLabelItems({ containingItemId: box.id }),
    })),
  });
  const contents = new Map<string, WebItem[]>();
  boxes.forEach((box, index) =>
    contents.set(box.id, (results[index]?.data ?? []).toSorted(compareInventoryNames))
  );
  return {
    contents,
    isLoading: results.some((result) => result.isPending || result.isFetching),
    error: results.find((result) => result.error !== null)?.error ?? null,
  };
}

function useDescendants(items: WebItem[]) {
  const boxes = items.filter((item) => item.isContainer);
  const results = useQueries({
    queries: boxes.map((box) => ({
      queryKey: [...WEB_ITEMS_QUERY_KEY, 'label-descendants', box.id] as const,
      queryFn: () => listLabelItems({ within: box.id, includeInactive: true }),
    })),
  });
  const descendants = new Map<string, WebItem[]>();
  boxes.forEach((box, index) =>
    descendants.set(
      box.id,
      (results[index]?.data ?? []).filter((descendant) => descendant.id !== box.id)
    )
  );
  return {
    descendants,
    isLoading: results.some((result) => result.isPending || result.isFetching),
    error: results.find((result) => result.error !== null)?.error ?? null,
  };
}

function useSuggestions(items: WebItem[]) {
  const uncoded = items.filter((item) => item.code === null);
  const results = useQueries({
    queries: uncoded.map((item) => ({
      queryKey: [...CODE_SUGGESTION_QUERY_KEY, item.id, item.name, item.typeKey] as const,
      queryFn: () => suggestCode(item),
    })),
  });
  const suggestions = new Map<string, string | null>();
  uncoded.forEach((item, index) => suggestions.set(item.id, results[index]?.data ?? null));
  return suggestions;
}

/** Loads the items behind `ids`, each box's contents, and codes to suggest. */
export function useLabelSubjects(ids: readonly string[]): LabelSubjects {
  const catalogue = usePublishedCatalogue();
  const catalogueFetching = useIsFetching({ queryKey: PUBLISHED_CATALOGUE_QUERY_KEY }) > 0;
  const listed = useQuery({
    queryKey: [...WEB_ITEMS_QUERY_KEY, 'labels', ids] as const,
    queryFn: () => listLabelItems({ ids: ids.join(',') }),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  });
  const items = listed.isPlaceholderData ? [] : (listed.data ?? []);
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const boxContents = useContents(ordered);
  const tree = useDescendants(ordered);
  const suggestions = useSuggestions(ordered);
  const subject = (item: WebItem) => toLabelSubject(item, suggestions.get(item.id) ?? null);
  const contents = new Map(
    [...boxContents.contents].map(([boxId, held]) => [boxId, held.map(subject)])
  );
  const fragility = new Map(
    ordered.map((item) => [
      item.id,
      treeFragility(item, tree.descendants.get(item.id) ?? [], catalogue.typeById),
    ])
  );
  return {
    isLoading: listed.isLoading,
    contentsLoading:
      listed.isPlaceholderData ||
      listed.isFetching ||
      boxContents.isLoading ||
      tree.isLoading ||
      catalogue.isPending ||
      catalogueFetching,
    error: readError(
      listed.error,
      boxContents.error,
      tree.error,
      catalogue.error,
      ...[...fragility.values()].map((value) => value.error)
    ),
    subjects: ordered.map(subject),
    missing: listed.data && !listed.isPlaceholderData ? ids.filter((id) => !byId.has(id)) : [],
    contents,
    fragility,
    details: new Map(
      ordered.map((item) => [
        item.id,
        detailsFor(item, contents.get(item.id) ?? [], catalogue.typeById),
      ])
    ),
  };
}

function readError(...errors: readonly unknown[]): Error | null {
  const error = errors.find((value) => value !== null && value !== undefined);
  if (error === undefined) return null;
  return error instanceof Error ? error : new Error(String(error));
}
