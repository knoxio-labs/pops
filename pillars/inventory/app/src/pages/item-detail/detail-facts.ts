import { formatFactValue } from '../../foundation/item-page/fact-value';

import type { CatalogueField, CatalogueType } from '../../catalogue-editor/types';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { ConnectionsGraphResponse, WebGetResponse } from '../../inventory-api/types.gen.js';
import type { DetailFact } from './detail-model';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function referenceIds(values: readonly unknown[]): string[] {
  return values.flatMap((value) => {
    if (isRecord(value) && value.targetKind === 'item' && typeof value.targetId === 'string') {
      return [value.targetId];
    }
    return [];
  });
}

function farIdForEdge(
  itemId: string,
  edge: ConnectionsGraphResponse['data']['edges'][number]
): string | null {
  if (edge.source === itemId) return edge.target;
  if (edge.target === itemId) return edge.source;
  return null;
}

function computedReferenceIds(item: WebGetResponse['item']): string[] {
  return item.computedValues.flatMap((entry) => {
    if (entry.state === 'ok' || entry.state === 'overridden') {
      return referenceIds(entry.values);
    }
    return [];
  });
}

/** Collects graph and field references used to resolve the detail page's related world. */
export function relatedItemIds(
  itemId: string,
  graph: ConnectionsGraphResponse['data'] | null,
  item: WebGetResponse['item'] | null
): string[] {
  const graphNodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const graphIds = (graph?.edges ?? []).flatMap((edge) => {
    const farId = farIdForEdge(itemId, edge);
    if (farId === null || graphNodes.get(farId)?.isFixture === true) return [];
    return [farId];
  });
  const storedIds = item?.fieldValues.flatMap((entry) => referenceIds(entry.values)) ?? [];
  const computedIds = item === null ? [] : computedReferenceIds(item);

  return [...new Set([...graphIds, ...storedIds, ...computedIds])]
    .filter((id) => id !== itemId)
    .toSorted();
}

function fieldLabel(type: CatalogueType, fieldId: string): string {
  return type.fields.find((field) => field.id === fieldId)?.label ?? fieldId;
}

function storedFact(
  item: WebGetResponse['item'],
  field: CatalogueField,
  relatedWorld: PlacementWorld
): DetailFact {
  const value = item.fieldValues.find((entry) => entry.fieldId === field.id);
  return {
    key: field.key,
    label: field.label,
    value: formatFactValue(value?.values ?? [], field, relatedWorld),
    origin: value?.source === 'override' ? 'overridden' : 'entered',
    inline: true,
  };
}

function computedFact(
  item: WebGetResponse['item'],
  type: CatalogueType,
  field: CatalogueField,
  relatedWorld: PlacementWorld
): DetailFact {
  const value = item.computedValues.find((entry) => entry.fieldId === field.id);
  if (value?.state === 'unavailable') {
    return {
      key: field.key,
      label: field.label,
      value: null,
      origin: 'missing-inputs',
      missingInputs: value.missingInputs.map((input) => fieldLabel(type, input.fieldId)),
      inline: false,
    };
  }
  return {
    key: field.key,
    label: field.label,
    value: formatFactValue(value?.values ?? [], field, relatedWorld),
    origin: value?.state === 'overridden' ? 'overridden' : 'calculated',
    inline: false,
  };
}

/** Maps a web item and published type into the ordered facts shown in the rail. */
export function toDetailFacts(
  item: WebGetResponse['item'],
  type: CatalogueType | null,
  relatedWorld: PlacementWorld
): DetailFact[] {
  const facts: DetailFact[] = [];
  if (item.quantity > 1) {
    facts.push({
      key: 'quantity',
      label: 'Quantity',
      value: String(item.quantity),
      origin: 'entered',
      inline: false,
    });
  }
  if (type === null) return facts;
  const fields = [...type.fields]
    .filter((field) => field.archivedAt === null)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
  for (const field of fields) {
    const fact =
      field.storage === 'stored'
        ? storedFact(item, field, relatedWorld)
        : computedFact(item, type, field, relatedWorld);
    facts.push(fact);
  }
  return facts;
}
