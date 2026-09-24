import { randomUUID } from 'node:crypto';

import { expect } from 'vitest';

import { SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import {
  PROTOCOL_2,
  send,
  wireMutation,
  type SyncHarness,
  type WireMutation,
} from './sync-harness.js';

import type { z } from 'zod';

import type { ReferenceComputedCatalogue } from '../../catalogue/__tests__/computed-reference-fixture.js';

export type SyncItem = z.infer<typeof SyncItemSchema>;

/** One change-feed page as the computed-value tests read it. */
export interface Feed {
  readonly items: SyncItem[];
  readonly events: { seq: number; entityId: string; kind: string; undoable: boolean }[];
}

export async function apply(target: SyncHarness, mutation: WireMutation): Promise<void> {
  const response = await send(target.api, [mutation], PROTOCOL_2);
  expect(response.status).toBe(200);
  expect(response.body.outcomes[0]).toMatchObject({ status: 'applied' });
}

export function ref(targetId: string): { targetKind: 'item'; targetId: string } {
  return { targetKind: 'item', targetId };
}

/** `item.create` of a typed item under `catalogue`. */
export function create(
  catalogue: ReferenceComputedCatalogue,
  id: string,
  item: { name: string; typeId: string; values: { fieldId: string; values: unknown[] }[] }
): WireMutation {
  return wireMutation('item.create', id, { item }, { catalogueRevision: catalogue.revision });
}

/** Creates a part, with `weight` when given. */
export async function createPart(
  target: SyncHarness,
  c: ReferenceComputedCatalogue,
  weight: number | null
): Promise<string> {
  const id = randomUUID();
  const values = weight === null ? [] : [{ fieldId: c.weightFieldId, values: [weight] }];
  await apply(
    target,
    create(c, id, { name: `Part ${weight ?? 'unweighed'}`, typeId: c.partTypeId, values })
  );
  return id;
}

export async function createKit(
  target: SyncHarness,
  c: ReferenceComputedCatalogue,
  partId: string
): Promise<string> {
  const id = randomUUID();
  await apply(
    target,
    create(c, id, {
      name: 'Kit',
      typeId: c.kitTypeId,
      values: [{ fieldId: c.kitPartFieldId, values: [ref(partId)] }],
    })
  );
  return id;
}

async function epochOf(target: SyncHarness): Promise<string> {
  const response = await target.api.get('/sync/snapshot').set(PROTOCOL_2).query({ limit: 1 });
  expect(response.status).toBe(200);
  return String(response.body.epoch);
}

export async function highWater(target: SyncHarness): Promise<number> {
  const response = await target.api.get('/sync/snapshot').set(PROTOCOL_2).query({ limit: 1 });
  return Number(response.body.highWaterSeq);
}

export async function changesSince(target: SyncHarness, since: number): Promise<Feed> {
  const response = await target.api
    .get('/sync/changes')
    .set(PROTOCOL_2)
    .query({ since, epoch: await epochOf(target), limit: 500 });
  expect(response.status).toBe(200);
  return {
    items: SyncItemSchema.array().parse(response.body.items),
    events: response.body.events as Feed['events'],
  };
}

export function row(feed: Feed, id: string): SyncItem {
  const found = feed.items.find((item) => item.id === id);
  if (found === undefined) throw new Error(`feed lacks ${id}`);
  return found;
}

export function computed(item: SyncItem, fieldId: string): SyncItem['computedValues'][number] {
  const value = item.computedValues.find((entry) => entry.fieldId === fieldId);
  if (value === undefined) throw new Error(`${item.id} has no computed ${fieldId}`);
  return value;
}
