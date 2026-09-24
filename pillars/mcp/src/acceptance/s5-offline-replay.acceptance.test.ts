/**
 * S5 — the offline replay seam. A phone authors commands against catalogue
 * revision N while offline; meanwhile an agent publishes N+1 through MCP
 * (a compatible rename plus an archived field and its replacement). When
 * the phone reconnects, its queue replays through BFM's real mobile route:
 * the rename-compatible write rebases and applies, the write to the replaced
 * field comes back `catalogue_repair_required`, and every retry of the same
 * envelope answers the same bytes.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DraftSession,
  fieldByKey,
  getItem,
  mutateItem,
  storedValues,
  typeByKey,
  type DescriptorType,
} from './test-helpers-acceptance-mcp.js';
import {
  startAcceptanceStack,
  type AcceptanceBfm,
  type AcceptanceStack,
} from './test-helpers-acceptance-stack.js';

const MUTATIONS_PATH = '/mobile/inventory/mutations';

const outcomesSchema = z.object({
  outcomes: z.array(
    z
      .object({ mutationId: z.string(), status: z.string(), reason: z.string().optional() })
      .catchall(z.unknown())
  ),
});
const historySchema = z.object({ events: z.array(z.unknown()) });

describe('S5 offline replay across a catalogue publication', () => {
  let stack: AcceptanceStack;
  let bfm: AcceptanceBfm;
  let authoredRevision: number;
  let tool: DescriptorType;
  const existingId = randomUUID();
  let existingRevision = 0;

  function queued(op: string, entityId: string, baseRevision: number | null, args: unknown) {
    return {
      mutationId: randomUUID(),
      op,
      entityId,
      baseRevision,
      catalogueRevision: authoredRevision,
      dependsOn: [],
      clientTime: '2026-09-24T00:00:00.000Z',
      args,
    };
  }

  async function replayTwice(mutations: readonly unknown[]) {
    const first = await bfm.post(MUTATIONS_PATH, { mutations });
    const retry = await bfm.post(MUTATIONS_PATH, { mutations });
    expect(first.status, first.text).toBe(200);
    return { first, retry, outcomes: outcomesSchema.parse(first.body).outcomes };
  }

  beforeAll(async () => {
    stack = await startAcceptanceStack(import.meta.url, { bfm: true });
    if (stack.bfm === undefined) throw new Error('BFM did not start');
    bfm = stack.bfm;
    await stack.activateProtocol2();

    const revisionN = await DraftSession.open();
    await revisionN.patch([{ kind: 'put_type', key: 'acc_tool', label: 'Acceptance tool' }]);
    const typeId = typeByKey(revisionN.descriptor, 'acc_tool').id;
    const stored = (key: string) => ({
      kind: 'put_field',
      typeId,
      key,
      label: key,
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    });
    await revisionN.patch([stored('serial'), stored('legacy_tag')]);
    const publishedN = await revisionN.mustPublish({ minimumProtocol: 2, note: 'S5 revision N' });
    authoredRevision = publishedN.revision.revision;
    tool = typeByKey(publishedN, 'acc_tool');
    existingRevision = await mutateItem('inventory.items.create', {
      itemName: 'Existing tool',
      entityId: existingId,
      catalogueRevision: authoredRevision,
      typeId: tool.id,
      fieldValues: [{ fieldId: fieldByKey(tool, 'legacy_tag').id, values: ['T-1'] }],
    });

    const revisionNext = await DraftSession.open();
    await revisionNext.patch([
      { kind: 'put_field', id: fieldByKey(tool, 'serial').id, typeId, label: 'Asset serial' },
      { kind: 'archive_field', id: fieldByKey(tool, 'legacy_tag').id },
      stored('replacement_tag'),
    ]);
    const publishedNext = await revisionNext.mustPublish({ note: 'S5 revision N+1' });
    expect(publishedNext.revision.revision).toBeGreaterThan(authoredRevision);
  });

  afterAll(async () => {
    await stack.stop();
  });

  it('S5.1 a create authored at N against a renamed field rebases onto N+1 and applies once', async () => {
    const itemId = randomUUID();
    const create = queued('item.create', itemId, null, {
      item: {
        name: 'Offline tool',
        typeId: tool.id,
        values: [{ fieldId: fieldByKey(tool, 'serial').id, values: ['SER-9'] }],
      },
    });
    const { first, retry, outcomes } = await replayTwice([create]);
    expect(outcomes).toEqual([
      expect.objectContaining({ mutationId: create.mutationId, status: 'applied' }),
    ]);
    expect(retry.text).toBe(first.text);

    stack.seam.useDefaultKey();
    expect(storedValues(await getItem(itemId), fieldByKey(tool, 'serial').id)).toEqual(['SER-9']);
    const history = await bfm.get(`/mobile/inventory/items/${itemId}/history`);
    expect(historySchema.parse(history.body).events).toHaveLength(1);
  });

  it('S5.2 an edit authored at N to the archived-and-replaced field returns catalogue_repair_required and changes nothing', async () => {
    const edit = queued('item.edit', existingId, existingRevision, {
      values: [{ fieldId: fieldByKey(tool, 'legacy_tag').id, values: ['T-2'] }],
    });
    const { first, retry, outcomes } = await replayTwice([edit]);
    expect(outcomes).toEqual([
      expect.objectContaining({
        mutationId: edit.mutationId,
        status: 'rejected',
        reason: 'catalogue_repair_required',
      }),
    ]);
    expect(retry.text).toBe(first.text);

    stack.seam.useDefaultKey();
    const unchanged = await getItem(existingId);
    expect(unchanged.revision).toBe(existingRevision);
    expect(storedValues(unchanged, fieldByKey(tool, 'legacy_tag').id)).toEqual(['T-1']);
  });

  it('S5.3 a mixed offline batch answers per mutation, in order, byte-stable across retries', async () => {
    const itemId = randomUUID();
    const batch = [
      queued('item.edit', existingId, existingRevision, {
        values: [{ fieldId: fieldByKey(tool, 'legacy_tag').id, values: ['T-3'] }],
      }),
      queued('item.create', itemId, null, {
        item: {
          name: 'Offline tool two',
          typeId: tool.id,
          values: [{ fieldId: fieldByKey(tool, 'serial').id, values: ['SER-10'] }],
        },
      }),
    ];
    const { first, retry, outcomes } = await replayTwice(batch);
    expect(outcomes.map((outcome) => [outcome.mutationId, outcome.status])).toEqual([
      [batch[0]?.mutationId, 'rejected'],
      [batch[1]?.mutationId, 'applied'],
    ]);
    expect(retry.text).toBe(first.text);
    const third = await bfm.post(MUTATIONS_PATH, { mutations: batch });
    expect(third.text).toBe(first.text);
  });
});
