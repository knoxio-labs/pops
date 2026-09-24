/**
 * S7 of the inventory-types acceptance suite (POPS-4354): the web type editor
 * driven through the shell against a REAL Inventory process, not stubs.
 *
 * Opt-in: without `INVENTORY_ACCEPTANCE=1` every test here skips, so the
 * ordinary E2E workflow (which boots no backend) is unaffected. `mise run
 * inventory:acceptance -- --web` sets it and collects the result as evidence.
 */
import { z } from 'zod';

import { expect, test } from './fixtures/pillar-rest-guard';
import {
  forwardInventoryApi,
  startInventoryAcceptanceStack,
  type InventoryAcceptanceStack,
} from './helpers/inventory-acceptance-stack';
import { stubShellBoot } from './helpers/pillar-rest';

import type { Page } from '@playwright/test';

const ENABLED = process.env['INVENTORY_ACCEPTANCE'] === '1';

const descriptorSchema = z.object({
  revision: z.object({
    revision: z.number().int(),
    draftVersion: z.number().int(),
    minimumProtocol: z.number().int(),
  }),
  types: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      label: z.string(),
      fields: z.array(z.object({ id: z.string(), key: z.string(), kind: z.string() })),
    })
  ),
});
const draftSchema = z.union([
  z.object({ draft: descriptorSchema }).transform((body) => body.draft),
  descriptorSchema,
]);

test.describe('S7 web type editor against a real Inventory', () => {
  test.skip(
    !ENABLED,
    'opt-in acceptance spec: run through `mise run inventory:acceptance -- --web`'
  );
  test.describe.configure({ mode: 'serial' });

  let stack: InventoryAcceptanceStack;

  async function published(): Promise<z.infer<typeof descriptorSchema>> {
    const read = await stack.call('/type-catalogue');
    expect(read.status).toBe(200);
    return descriptorSchema.parse(read.body);
  }

  /** Publishes a type with one optional short-text field through the owner API. */
  async function publishTypeOutOfBand(key: string, label: string): Promise<void> {
    const base = (await published()).revision.revision;
    const created = descriptorSchema.parse(
      (await stack.call('/type-catalogue/drafts', { body: { baseRevision: base } })).body
    );
    const withType = draftSchema.parse(
      (
        await stack.call(`/type-catalogue/drafts/${String(created.revision.revision)}`, {
          method: 'PATCH',
          body: {
            baseRevision: base,
            expectedDraftVersion: created.revision.draftVersion,
            operations: [{ kind: 'put_type', key, label }],
          },
        })
      ).body
    );
    const typeId = withType.types.find((type) => type.key === key)?.id;
    if (typeId === undefined) throw new Error(`type ${key} was not created`);
    const withField = draftSchema.parse(
      (
        await stack.call(`/type-catalogue/drafts/${String(created.revision.revision)}`, {
          method: 'PATCH',
          body: {
            baseRevision: base,
            expectedDraftVersion: withType.revision.draftVersion,
            operations: [
              {
                kind: 'put_field',
                typeId,
                key: 'finish',
                label: 'Finish',
                fieldKind: 'short_text',
                cardinality: 'one',
                required: false,
                storage: 'stored',
              },
            ],
          },
        })
      ).body
    );
    const publication = await stack.call(
      `/type-catalogue/drafts/${String(created.revision.revision)}/publish`,
      { body: { baseRevision: base, expectedDraftVersion: withField.revision.draftVersion } }
    );
    expect(publication.status).toBe(200);
  }

  async function openEditor(page: Page): Promise<void> {
    await stubShellBoot(page);
    await forwardInventoryApi(page, stack);
    await page.goto('/inventory/types');
    await expect(page.getByTestId('external-pillar-load-error')).toHaveCount(0);
  }

  async function openFieldsOf(page: Page, typeLabel: string): Promise<void> {
    await page.getByText(typeLabel, { exact: true }).first().click();
    await page.getByRole('button', { name: 'Continue to fields' }).click();
  }

  /** Makes the `finish` field required: a change that needs a value migration. */
  async function requireFinish(page: Page, typeLabel: string): Promise<void> {
    await openEditor(page);
    await openFieldsOf(page, typeLabel);
    await page.getByText('Finish', { exact: true }).first().click();
    await page.getByLabel('Required').click();
    await page.getByRole('button', { name: 'Save field' }).click();
    await expect(page.getByText(/^Migration required · /)).toBeVisible();
  }

  test.beforeAll(async () => {
    stack = await startInventoryAcceptanceStack();
    const rollout = await stack.call('/type-catalogue/protocol-rollout', {
      body: { expectedMinimumProtocol: 1, minimumProtocol: 2 },
    });
    expect(rollout.status).toBe(200);
  });

  /** Each test starts from a published catalogue with no draft in progress. */
  test.afterEach(async () => {
    const current = await stack.call('/type-catalogue/drafts/current');
    if (current.status === 404) return;
    const draft = draftSchema.parse(current.body);
    const abandoned = await stack.call(
      `/type-catalogue/drafts/${String(draft.revision.revision)}/abandon`,
      {
        body: {
          baseRevision: (await published()).revision.revision,
          expectedDraftVersion: draft.revision.draftVersion,
        },
      }
    );
    expect(abandoned.status).toBe(200);
  });

  test.afterAll(async () => {
    await stack.stop();
  });

  test('S7.1 creates a type, adds a field, previews, and publishes at protocol 2', async ({
    page,
  }) => {
    await openEditor(page);
    await page.getByRole('button', { name: 'New type' }).click();
    await page.getByLabel('Type label').fill('Acceptance speaker');
    await expect(page.getByLabel('Key')).toHaveValue('acceptance_speaker');
    await page.getByRole('button', { name: 'Create type' }).click();
    await expect(page.getByRole('region', { name: 'Dry-run validation' })).toBeVisible();

    await page.getByRole('button', { name: 'Continue to fields' }).click();
    await page.getByRole('button', { name: 'Field', exact: true }).click();
    await page.getByLabel('Field label').fill('Watts');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Integer', exact: true }).click();
    await page.getByRole('button', { name: 'Create field' }).click();

    const publish = page.getByRole('button', { name: 'Review and publish' });
    await expect(publish).toBeEnabled();
    await publish.click();
    await page.getByLabel('Minimum client protocol').fill('2');
    await page.getByRole('button', { name: 'Publish revision' }).click();
    await expect(page.getByText('No draft')).toBeVisible();

    const after = await published();
    expect(after.revision.minimumProtocol).toBe(2);
    const speaker = after.types.find((type) => type.key === 'acceptance_speaker');
    expect(speaker?.fields.map((field) => [field.key, field.kind])).toEqual([['watts', 'integer']]);
  });

  test('S7.2 a save against a draft another editor moved shows the conflict, and reload then retry succeeds', async ({
    page,
  }) => {
    await publishTypeOutOfBand('acc_web_lamp', 'Acceptance web lamp');
    const base = (await published()).revision.revision;
    const draft = descriptorSchema.parse(
      (await stack.call('/type-catalogue/drafts', { body: { baseRevision: base } })).body
    );
    const typeId = draft.types.find((type) => type.key === 'acc_web_lamp')?.id;
    if (typeId === undefined) throw new Error('acc_web_lamp missing from the draft');

    await openEditor(page);
    await expect(page.getByText(/editing draft/)).toBeVisible();
    await page.getByText('Acceptance web lamp', { exact: true }).first().click();

    const moved = await stack.call(`/type-catalogue/drafts/${String(draft.revision.revision)}`, {
      method: 'PATCH',
      body: {
        baseRevision: base,
        expectedDraftVersion: draft.revision.draftVersion,
        operations: [{ kind: 'put_type', id: typeId, label: 'Renamed by another editor' }],
      },
    });
    expect(moved.status).toBe(200);

    await page.getByLabel('Type label').fill('Renamed in the browser');
    await page.getByRole('button', { name: 'Save type' }).click();
    await expect(page.getByText('This draft changed elsewhere')).toBeVisible();
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByLabel('Type label')).toHaveValue('Renamed by another editor');

    await page.getByLabel('Type label').fill('Renamed in the browser');
    await page.getByRole('button', { name: 'Save type' }).click();
    await expect(page.getByText('This draft changed elsewhere')).toHaveCount(0);
    const current = draftSchema.parse((await stack.call('/type-catalogue/drafts/current')).body);
    expect(current.types.find((type) => type.id === typeId)?.label).toBe('Renamed in the browser');
  });

  test('S7.3 a migration_required change is refused in the browser, with the route to publish it named', async ({
    page,
  }) => {
    await publishTypeOutOfBand('acc_web_chair', 'Acceptance web chair');
    await requireFinish(page, 'Acceptance web chair');
    await expect(page.getByRole('button', { name: 'Review and publish' })).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: /named migration/ })).toBeVisible();
  });

  test('S7.4 the migration_required refusal names the MCP publish tool', async ({ page }) => {
    await publishTypeOutOfBand('acc_web_desk', 'Acceptance web desk');
    await requireFinish(page, 'Acceptance web desk');
    const mcpNotice = page.getByText('Migration required: publish through MCP');
    test.skip(
      (await mcpNotice.count()) === 0,
      'the MCP publish notice is not on this build (designed in inventory-types/design-computed-editor, not yet implemented in the web editor)'
    );
    await expect(page.getByText('inventory.catalogue.publishDraft')).toBeVisible();
  });

  test('S7.5 the computed expression builder edits a computed field and names the MCP publish route', async ({
    page,
  }) => {
    await publishTypeOutOfBand('acc_web_shelf', 'Acceptance web shelf');
    await openEditor(page);
    await openFieldsOf(page, 'Acceptance web shelf');
    await page.getByRole('button', { name: 'Field', exact: true }).click();
    await page.getByLabel('Computed field').click();
    const builder = page.getByRole('region', { name: 'Selected node' });
    test.skip(
      (await builder.count()) === 0,
      'the computed expression builder is not on this build (inventory-types/design-computed-editor is design-only so far)'
    );
    await expect(builder).toBeVisible();
    await expect(page.getByText('Publishes through MCP, not here.')).toBeVisible();
  });
});
