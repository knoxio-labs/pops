/**
 * Real-boundary coverage for the catalogue draft lifecycle (POPS-4362,
 * POPS-4385, POPS-4386): every call here crosses real JSON serialization and
 * a real HTTP round trip to a spawned Inventory process, through the same
 * `pillar-client.ts` / registry-discovery path production boot uses — not
 * `vi.mock('../pillar-client.js')`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { catalogueTools } from '../inventory-catalogue.js';
import { startLiveSeam, type LiveSeam } from './live-seam-harness.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from '../tool-def.js';

function tool(name: string): ToolDef {
  const found = catalogueTools.find((entry) => entry.name === name);
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

function draftRevision(body: Record<string, unknown>): { revision: number; draftVersion: number } {
  const draft = (body['draft'] ?? body) as Record<string, unknown>;
  const revision = draft['revision'] as { revision: number; draftVersion: number };
  return { revision: revision.revision, draftVersion: revision.draftVersion };
}

const readDraft = tool('inventory.catalogue.readDraft');
const createDraft = tool('inventory.catalogue.createDraft');
const patchDraft = tool('inventory.catalogue.patchDraft');
const previewDraft = tool('inventory.catalogue.previewDraft');
const publishDraft = tool('inventory.catalogue.publishDraft');
const abandonDraft = tool('inventory.catalogue.abandonDraft');
const catalogueGet = catalogueTools.find((entry) => entry.name === 'inventory.catalogue.get');
if (catalogueGet === undefined) throw new Error('inventory.catalogue.get missing');

describe('inventory catalogue MCP tools — real HTTP boundary', () => {
  let seam: LiveSeam;

  beforeAll(async () => {
    seam = await startLiveSeam(import.meta.url);
    seam.useDefaultKey();
  }, 60_000);

  afterAll(async () => {
    await seam.stop();
  });

  it('reports a missing draft as not-found through the real REST boundary', async () => {
    const result = await readDraft.handler({});
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/catalogue_draft_missing/);
  });

  it('completes readDraft -> patch -> preview -> publish, survives a stale conflict, and recovers', async () => {
    const published = ok(await catalogueGet.handler({}));
    const baseRevision = (published['revision'] as { revision: number }).revision;

    const created = draftRevision(ok(await createDraft.handler({ baseRevision })));

    const patched = draftRevision(
      ok(
        await patchDraft.handler({
          revision: created.revision,
          baseRevision,
          expectedDraftVersion: created.draftVersion,
          operations: [{ kind: 'put_type', key: 'seam_widget', label: 'Seam widget' }],
        })
      )
    );
    expect(patched.draftVersion).toBeGreaterThan(created.draftVersion);

    // A fresh session recovers the draft without any remembered state.
    const recovered = draftRevision(ok(await readDraft.handler({})));
    expect(recovered).toEqual(patched);

    // previewDraft validates without changing the draft's revision.draftVersion.
    ok(
      await previewDraft.handler({
        revision: patched.revision,
        baseRevision,
        expectedDraftVersion: patched.draftVersion,
        operations: [{ kind: 'put_type', key: 'seam_widget_preview_only', label: 'Preview only' }],
      })
    );
    const afterPreview = draftRevision(ok(await readDraft.handler({})));
    expect(afterPreview).toEqual(patched);

    // A stale expectedDraftVersion is refused with a conflict, not silently applied.
    const stale = await patchDraft.handler({
      revision: patched.revision,
      baseRevision,
      expectedDraftVersion: created.draftVersion,
      operations: [{ kind: 'put_type', key: 'seam_widget_stale', label: 'Stale' }],
    });
    expect(stale.isError).toBe(true);
    expect(text(stale)).toMatch(/catalogue_draft_conflict/);

    // Recovery: read the current draft, then retry with its real expectedDraftVersion.
    const currentBeforeRetry = draftRevision(ok(await readDraft.handler({})));
    expect(currentBeforeRetry).toEqual(patched);
    const retried = draftRevision(
      ok(
        await patchDraft.handler({
          revision: currentBeforeRetry.revision,
          baseRevision,
          expectedDraftVersion: currentBeforeRetry.draftVersion,
          operations: [{ kind: 'put_type', key: 'seam_widget_stale', label: 'Stale, retried' }],
        })
      )
    );
    expect(retried.draftVersion).toBeGreaterThan(currentBeforeRetry.draftVersion);

    const publishedResult = ok(
      await publishDraft.handler({
        revision: retried.revision,
        baseRevision,
        expectedDraftVersion: retried.draftVersion,
        note: 'live-seam draft lifecycle',
      })
    );
    expect((publishedResult['revision'] as { revision: number }).revision).toBeGreaterThan(
      baseRevision
    );

    // The draft is consumed by publication.
    const afterPublish = await readDraft.handler({});
    expect(afterPublish.isError).toBe(true);
    expect(text(afterPublish)).toMatch(/catalogue_draft_missing/);
  });

  it('surfaces catalogue_migration_required as an actionable failure when publishing without a migration', async () => {
    const published = ok(await catalogueGet.handler({}));
    const baseRevision = (published['revision'] as { revision: number }).revision;
    const types = published['types'] as {
      id: string;
      fields: { id: string; required: boolean }[];
    }[];
    const optionalField = types
      .flatMap((type) => type.fields.map((field) => ({ ...field, typeId: type.id })))
      .find((field) => !field.required);
    if (optionalField === undefined) throw new Error('no optional built-in field to migrate');

    const created = draftRevision(ok(await createDraft.handler({ baseRevision })));
    const patched = draftRevision(
      ok(
        await patchDraft.handler({
          revision: created.revision,
          baseRevision,
          expectedDraftVersion: created.draftVersion,
          operations: [
            {
              kind: 'put_field',
              id: optionalField.id,
              typeId: optionalField.typeId,
              required: true,
            },
          ],
        })
      )
    );

    const publishWithoutMigration = await publishDraft.handler({
      revision: patched.revision,
      baseRevision,
      expectedDraftVersion: patched.draftVersion,
    });
    expect(publishWithoutMigration.isError).toBe(true);
    expect(text(publishWithoutMigration)).toMatch(/catalogue_migration_required/);

    await abandonDraft.handler({
      revision: patched.revision,
      baseRevision,
      expectedDraftVersion: patched.draftVersion,
    });
  });

  it('surfaces a forbidden immutable-shape change through previewDraft', async () => {
    const published = ok(await catalogueGet.handler({}));
    const baseRevision = (published['revision'] as { revision: number }).revision;
    const types = published['types'] as {
      id: string;
      fields: { id: string; kind: string }[];
    }[];
    const textField = types
      .flatMap((type) => type.fields.map((field) => ({ ...field, typeId: type.id })))
      .find((field) => field.kind === 'short_text');
    if (textField === undefined) throw new Error('no short_text built-in field to change');

    const created = draftRevision(ok(await createDraft.handler({ baseRevision })));
    const preview = await previewDraft.handler({
      revision: created.revision,
      baseRevision,
      expectedDraftVersion: created.draftVersion,
      operations: [
        { kind: 'put_field', id: textField.id, typeId: textField.typeId, fieldKind: 'long_text' },
      ],
    });
    expect(preview.isError).toBe(true);
    expect(text(preview)).toMatch(/forbidden|immutable_shape/);

    await abandonDraft.handler({
      revision: created.revision,
      baseRevision,
      expectedDraftVersion: created.draftVersion,
    });
  });

  it('surfaces unauthorized (401) for a service account without the inventory scope', async () => {
    const unscoped = await seam.mintKey('mcp-live-seam-unscoped', ['finance']);
    seam.useKey(unscoped);
    try {
      const result = await catalogueGet.handler({});
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/authoris/);
    } finally {
      seam.useDefaultKey();
    }
  });

  it('surfaces unavailable for a connection refused', async () => {
    seam.useDefaultKey();
    const closedPort = 39; // never listened on; loopback refuses immediately.
    process.env['POPS_INVENTORY_API_URL'] = `http://127.0.0.1:${String(closedPort)}`;
    try {
      const result = await catalogueGet.handler({});
      expect(result.isError).toBe(true);
      expect(text(result)).toMatch(/unavailable/);
    } finally {
      delete process.env['POPS_INVENTORY_API_URL'];
      seam.useDefaultKey();
    }
  });
});
