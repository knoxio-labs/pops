/**
 * Real-boundary coverage for the protocol-2 generic item tools and computed
 * overrides (POPS-4362): create type -> create item -> edit -> setOverride
 * -> clearOverride -> read computed values, plus non-mutating validation.
 * Every call crosses real JSON serialization and a real HTTP round trip to a
 * spawned Inventory process — not `vi.mock('../pillar-client.js')`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { catalogueTools } from '../inventory-catalogue.js';
import { itemValidationTool } from '../inventory-item-validation.js';
import { itemTools } from '../inventory-items.js';
import { startLiveSeam, type LiveSeam } from './live-seam-harness.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from '../tool-def.js';

function tool(tools: readonly ToolDef[], name: string): ToolDef {
  const found = tools.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`tool not found: ${name}`);
  return found;
}

function text(result: CallToolResult): string {
  const first = result.content[0];
  if (first === undefined || first.type !== 'text') throw new Error('expected text content');
  return first.text;
}

function ok(result: CallToolResult): Record<string, unknown> {
  expect(result.isError, text(result)).toBeFalsy();
  return JSON.parse(text(result)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function revisionOf(body: Record<string, unknown>): { revision: number; draftVersion: number } {
  const revision = body['revision'];
  if (!isRecord(revision)) {
    throw new Error('catalogue response did not include revision metadata');
  }
  const { revision: revisionNumber, draftVersion } = revision;
  if (typeof revisionNumber !== 'number' || typeof draftVersion !== 'number') {
    throw new Error('catalogue response included invalid revision metadata');
  }
  return { revision: revisionNumber, draftVersion };
}

function changedId(body: Record<string, unknown>, kind: string, key: string): string {
  const changed = body['changed'];
  if (!Array.isArray(changed))
    throw new Error('patch response did not include changed definitions');
  const match = changed.find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && entry['kind'] === kind && entry['key'] === key
  );
  if (match === undefined) {
    throw new Error(`patch response did not include ${kind} ${key}`);
  }
  const id = match['id'];
  if (typeof id !== 'string') throw new Error(`patch response had no id for ${kind} ${key}`);
  return id;
}

const catalogueGet = tool(catalogueTools, 'inventory.catalogue.get');
const createDraft = tool(catalogueTools, 'inventory.catalogue.createDraft');
const patchDraft = tool(catalogueTools, 'inventory.catalogue.patchDraft');
const publishDraft = tool(catalogueTools, 'inventory.catalogue.publishDraft');

const itemsCreate = tool(itemTools, 'inventory.items.create');
const itemsUpdate = tool(itemTools, 'inventory.items.update');
const itemsGet = tool(itemTools, 'inventory.items.get');
const itemsSetOverride = tool(itemTools, 'inventory.items.setOverride');
const itemsClearOverride = tool(itemTools, 'inventory.items.clearOverride');

interface ComputedEntry {
  fieldId: string;
  state: 'ok' | 'overridden' | 'unavailable';
  values?: unknown[];
}

function itemOf(body: Record<string, unknown>): Record<string, unknown> {
  return body['item'] as Record<string, unknown>;
}

function computedFor(body: Record<string, unknown>, fieldId: string): ComputedEntry {
  const entries = itemOf(body)['computedValues'] as ComputedEntry[];
  const found = entries.find((entry) => entry.fieldId === fieldId);
  if (found === undefined) throw new Error(`no computed value for field ${fieldId}`);
  return found;
}

function fieldValue(body: Record<string, unknown>, fieldId: string): unknown {
  const entries = itemOf(body)['fieldValues'] as { fieldId: string; values: unknown[] }[];
  const found = entries.find((entry) => entry.fieldId === fieldId);
  return found?.values[0];
}

describe('inventory item MCP tools — real HTTP boundary', () => {
  let seam: LiveSeam;
  let catalogueRevision: number;
  let typeId: string;
  let priceFieldId: string;
  let doubledFieldId: string;

  beforeAll(async () => {
    seam = await startLiveSeam(import.meta.url);
    seam.useDefaultKey();
    // The fixture publishes integer fields, which need protocol 2 active. MCP has no
    // rollout tool (activation is an owner operation), so it goes to Inventory directly.
    const rollout = await fetch(`${seam.inventoryBaseUrl}/type-catalogue/protocol-rollout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': seam.apiKey },
      body: JSON.stringify({ expectedMinimumProtocol: 1, minimumProtocol: 2 }),
    });
    expect(rollout.status, await rollout.text()).toBe(200);

    const published = ok(await catalogueGet.handler({}));
    const baseRevision = (published['revision'] as { revision: number }).revision;

    const created = ok(await createDraft.handler({ baseRevision }));
    const createdRevision = revisionOf(created);

    const withType = ok(
      await patchDraft.handler({
        revision: createdRevision.revision,
        baseRevision,
        expectedDraftVersion: createdRevision.draftVersion,
        operations: [{ kind: 'put_type', key: 'seam_gadget', label: 'Seam gadget' }],
      })
    );
    typeId = changedId(withType, 'type', 'seam_gadget');
    const withTypeRevision = revisionOf(withType);

    const withPrice = ok(
      await patchDraft.handler({
        revision: withTypeRevision.revision,
        baseRevision,
        expectedDraftVersion: withTypeRevision.draftVersion,
        operations: [
          {
            kind: 'put_field',
            typeId,
            key: 'price',
            label: 'Price',
            fieldKind: 'integer',
            cardinality: 'one',
            required: false,
            storage: 'stored',
          },
        ],
      })
    );
    priceFieldId = changedId(withPrice, 'field', 'price');
    const withPriceRevision = revisionOf(withPrice);

    const withDoubled = ok(
      await patchDraft.handler({
        revision: withPriceRevision.revision,
        baseRevision,
        expectedDraftVersion: withPriceRevision.draftVersion,
        operations: [
          {
            kind: 'put_field',
            typeId,
            key: 'doubled',
            label: 'Doubled price',
            fieldKind: 'integer',
            cardinality: 'one',
            required: false,
            storage: 'computed',
            allowOverride: true,
            expressionVersion: 1,
            expression: {
              op: 'add',
              left: { op: 'read', path: [], fieldId: priceFieldId },
              right: { op: 'read', path: [], fieldId: priceFieldId },
            },
          },
        ],
      })
    );
    doubledFieldId = changedId(withDoubled, 'field', 'doubled');
    const withDoubledRevision = revisionOf(withDoubled);

    const publishedResult = ok(
      await publishDraft.handler({
        revision: withDoubledRevision.revision,
        baseRevision,
        expectedDraftVersion: withDoubledRevision.draftVersion,
        note: 'live-seam item lifecycle fixture',
      })
    );
    catalogueRevision = revisionOf(publishedResult).revision;
  }, 60_000);

  afterAll(async () => {
    await seam.stop();
  });

  it('creates, edits, overrides, clears and reads a computed field end to end', async () => {
    const itemId = randomUUID();
    const created = ok(
      await itemsCreate.handler({
        itemName: 'Seam gadget one',
        entityId: itemId,
        catalogueRevision,
        typeId,
        fieldValues: [{ fieldId: priceFieldId, values: [10] }],
      })
    );
    expect((created['outcome'] as { status: string }).status).toBe('applied');
    let revision = (created['outcome'] as { revision: number }).revision;

    const afterCreate = ok(await itemsGet.handler({ id: itemId }));
    expect(fieldValue(afterCreate, priceFieldId)).toBe(10);
    expect(computedFor(afterCreate, doubledFieldId)).toMatchObject({ state: 'ok', values: [20] });

    const edited = ok(
      await itemsUpdate.handler({
        id: itemId,
        revision,
        catalogueRevision,
        fieldValues: [{ fieldId: priceFieldId, values: [15] }],
      })
    );
    revision = (edited['outcome'] as { revision: number }).revision;

    const afterEdit = ok(await itemsGet.handler({ id: itemId }));
    expect(computedFor(afterEdit, doubledFieldId)).toMatchObject({ state: 'ok', values: [30] });

    const overridden = ok(
      await itemsSetOverride.handler({
        id: itemId,
        revision,
        catalogueRevision,
        fieldId: doubledFieldId,
        value: 999,
      })
    );
    revision = (overridden['outcome'] as { revision: number }).revision;

    const afterOverride = ok(await itemsGet.handler({ id: itemId }));
    expect(computedFor(afterOverride, doubledFieldId)).toMatchObject({
      state: 'overridden',
      values: [999],
    });

    const cleared = ok(
      await itemsClearOverride.handler({
        id: itemId,
        revision,
        catalogueRevision,
        fieldId: doubledFieldId,
      })
    );
    revision = (cleared['outcome'] as { revision: number }).revision;

    const afterClear = ok(await itemsGet.handler({ id: itemId }));
    expect(computedFor(afterClear, doubledFieldId)).toMatchObject({ state: 'ok', values: [30] });
  });

  it('validates a value set without mutating the item it was checked against', async () => {
    const itemId = randomUUID();
    const created = ok(
      await itemsCreate.handler({
        itemName: 'Seam gadget two',
        entityId: itemId,
        catalogueRevision,
        typeId,
        fieldValues: [{ fieldId: priceFieldId, values: [7] }],
      })
    );
    expect((created['outcome'] as { status: string }).status).toBe('applied');

    const validation = ok(
      await itemValidationTool.handler({
        catalogueRevision,
        typeId,
        existingItemId: itemId,
        fieldValues: [{ fieldId: priceFieldId, source: 'stored', values: [999] }],
      })
    );
    expect(validation).toBeDefined();

    const afterValidate = ok(await itemsGet.handler({ id: itemId }));
    expect(fieldValue(afterValidate, priceFieldId)).toBe(7);
    expect(computedFor(afterValidate, doubledFieldId)).toMatchObject({
      state: 'ok',
      values: [14],
    });
  });
});
