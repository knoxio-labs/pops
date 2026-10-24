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
import { detailsFor } from './label-details.js';
import { labelFieldState } from './label-field-state';
import { treeFragility } from './label-fragility.js';
import { combineLabelReads, labelReadState } from './label-read-state';
import { listLabelItems } from './label-subject-reads.js';
import { useLabelItemReads } from './use-label-item-reads';

import type { LabelDetails, LabelFieldChoice, PrintSubject } from '@pops/inventory/labels';

import type { LabelFragility } from './label-fragility.js';
import type { WebItem } from './label-item';
import type { LabelReads } from './label-read-state';

export type { WebItem } from './label-item';

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
  /** True while selected items or direct contents needed for expansion refresh. */
  contentsLoading: boolean;
  /** Failure of the selected-item read; optional data failures remain independent. */
  error: Error | null;
  /** Failure of direct contents reads, required only for contents expansion or printing. */
  contentsError: Error | null;
  reads: LabelReads;
  fields: LabelFieldChoice[];
  fieldErrors: ReadonlyMap<string, ReadonlyMap<string, Error>>;
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

function uniqueFieldChoices(
  states: Iterable<ReturnType<typeof labelFieldState>>
): LabelFieldChoice[] {
  const choices = new Map<string, LabelFieldChoice>();
  for (const state of states) {
    for (const choice of state.choices) choices.set(choice.id, choice);
  }
  return [...choices.values()];
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
  const boxContents = useLabelItemReads(ordered, 'contents');
  const tree = useLabelItemReads(ordered, 'descendants');
  const suggestions = useSuggestions(ordered);
  const subject = (item: WebItem) => toLabelSubject(item, suggestions.get(item.id) ?? null);
  const contents = new Map(
    [...boxContents.items].map(([boxId, held]) => [boxId, held.map(subject)])
  );
  const fragility = new Map(
    ordered.map((item) => [
      item.id,
      treeFragility(item, tree.items.get(item.id) ?? [], catalogue.typeById),
    ])
  );
  const fields = new Map(
    ordered.map((item) => [item.id, labelFieldState(item, catalogue.typeById)])
  );
  const reads: LabelReads = {
    items: labelReadState(listed.isPlaceholderData || listed.isFetching, listed.error),
    catalogue: labelReadState(catalogue.isPending || catalogueFetching, catalogue.error),
    contents: boxContents.reads,
    descendants: tree.reads,
  };
  const expansion = combineLabelReads([reads.items, ...reads.contents.values()]);
  return {
    isLoading: listed.isLoading,
    contentsLoading: expansion.pending,
    error: reads.items.error,
    contentsError: expansion.error,
    reads,
    fields: uniqueFieldChoices(fields.values()),
    fieldErrors: new Map([...fields].map(([id, state]) => [id, state.errors])),
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
