/**
 * S4 — two editors on one catalogue draft. Editor A is an MCP agent; editor
 * B talks to Inventory's owner REST surface directly, the route the web
 * editor uses. A stale `expectedDraftVersion` must be refused with a
 * conflict that changes nothing, a reload must make the retry succeed, and a
 * publication racing an edit must let exactly one of them win.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  descriptorSchema,
  DraftSession,
  mustRefuse,
  publishedCatalogue,
  typeByKey,
} from './test-helpers-acceptance-mcp.js';
import { startAcceptanceStack, type AcceptanceStack } from './test-helpers-acceptance-stack.js';

const conflictSchema = z.object({
  code: z.literal('catalogue_draft_conflict'),
  currentDraftVersion: z.number().int().positive(),
});
const currentDraftSchema = z.union([
  z.object({ draft: descriptorSchema }).transform((body) => body.draft),
  descriptorSchema,
]);

describe('S4 catalogue draft concurrency', () => {
  let stack: AcceptanceStack;

  async function editorBReads(): Promise<z.infer<typeof descriptorSchema>> {
    const current = await stack.inventory('/type-catalogue/drafts/current');
    expect(current.status).toBe(200);
    return currentDraftSchema.parse(current.body);
  }

  function editorBPatches(
    draft: DraftSession,
    expectedDraftVersion: number,
    operations: readonly Record<string, unknown>[]
  ) {
    return stack.inventory(`/type-catalogue/drafts/${String(draft.revision)}`, {
      method: 'PATCH',
      body: { baseRevision: draft.baseRevision, expectedDraftVersion, operations },
    });
  }

  beforeAll(async () => {
    stack = await startAcceptanceStack(import.meta.url);
  });

  afterAll(async () => {
    await stack.stop();
  });

  it('S4.1 a stale expectedDraftVersion is refused with 409 and changes nothing; reload and retry succeeds', async () => {
    stack.seam.useDefaultKey();
    const editorA = await DraftSession.open();
    const seenByB = await editorBReads();
    expect(seenByB.revision.draftVersion).toBe(editorA.version);

    await editorA.patch([{ kind: 'put_type', key: 'acc_from_a', label: 'From editor A' }]);

    const stale = await editorBPatches(editorA, seenByB.revision.draftVersion, [
      { kind: 'put_type', key: 'acc_from_b', label: 'From editor B' },
    ]);
    expect(stale.status).toBe(409);
    expect(conflictSchema.parse(stale.body).currentDraftVersion).toBe(editorA.version);
    const unchanged = await editorBReads();
    expect(unchanged.revision.draftVersion).toBe(editorA.version);
    expect(unchanged.types.some((type) => type.key === 'acc_from_b')).toBe(false);

    const retried = await editorBPatches(editorA, unchanged.revision.draftVersion, [
      { kind: 'put_type', key: 'acc_from_b', label: 'From editor B' },
    ]);
    expect(retried.status).toBe(200);
    const merged = await editorBReads();
    expect(merged.types.map((type) => type.key)).toEqual(
      expect.arrayContaining(['acc_from_a', 'acc_from_b'])
    );

    const staleForA = await editorA.patchAt(editorA.version, [
      { kind: 'put_type', key: 'acc_from_a_again', label: 'A again' },
    ]);
    expect(staleForA.ok).toBe(false);
    expect(staleForA.ok ? '' : staleForA.message).toMatch(/catalogue_draft_conflict/);
    await (await DraftSession.resume(editorA.baseRevision)).abandon();
  });

  it('S4.2 a publication racing an edit lets exactly one win, and the loser changes nothing', async () => {
    stack.seam.useDefaultKey();
    const before = await publishedCatalogue();
    const editorA = await DraftSession.open();
    await editorA.patch([{ kind: 'put_type', key: 'acc_race_base', label: 'Race base' }]);
    const version = editorA.version;

    const [published, edited] = await Promise.all([
      editorA.publish({ note: 'S4 race' }),
      editorBPatches(editorA, version, [
        { kind: 'put_type', key: 'acc_race_edit', label: 'Race edit' },
      ]),
    ]);
    const publishWon = published.ok;
    const editWon = edited.status === 200;
    expect(publishWon !== editWon).toBe(true);

    const after = await publishedCatalogue();
    if (publishWon) {
      expect(edited.status).toBe(409);
      expect(after.revision.revision).toBe(editorA.revision);
      expect(after.types.some((type) => type.key === 'acc_race_edit')).toBe(false);
      typeByKey(after, 'acc_race_base');
      expect(await mustRefuse('inventory.catalogue.readDraft', {})).toMatch(
        /catalogue_draft_missing/
      );
    } else {
      expect(published.ok ? '' : published.message).toMatch(/catalogue_draft_conflict/);
      expect(after.revision.revision).toBe(before.revision.revision);
      const draft = await editorBReads();
      expect(draft.revision.draftVersion).toBeGreaterThan(version);
      await (await DraftSession.resume(editorA.baseRevision)).abandon();
    }
  });

  it('S4.3 publishing at a stale draft version is refused and publishes nothing', async () => {
    stack.seam.useDefaultKey();
    const before = await publishedCatalogue();
    const editorA = await DraftSession.open();
    const staleVersion = editorA.version;
    await editorA.patch([{ kind: 'put_type', key: 'acc_stale_publish', label: 'Stale publish' }]);

    const refused = await mustRefuse('inventory.catalogue.publishDraft', {
      revision: editorA.revision,
      baseRevision: editorA.baseRevision,
      expectedDraftVersion: staleVersion,
    });
    expect(refused).toMatch(/catalogue_draft_conflict/);
    expect((await publishedCatalogue()).revision.revision).toBe(before.revision.revision);

    const published = await editorA.mustPublish({ note: 'S4 fresh publish' });
    typeByKey(published, 'acc_stale_publish');
  });
});
