/**
 * Live seam coverage for an offline inventory mutation crossing the phone,
 * BFM and Inventory boundaries after its authored catalogue has changed.
 *
 * The ordinary BFM suite replaces Inventory with a fake handle, while the
 * Inventory command suite calls the engine directly. This suite starts the
 * real registry, Inventory and BFM processes, publishes revision N+1 through
 * Inventory's owner API, then replays revision-N phone envelopes through
 * BFM's authenticated mobile route and the SDK's discovered HTTP contract.
 */
import { createSecretKey, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  startRecordingProxy,
  waitForRegistration,
  type RecordingProxy,
  type SpawnedPillarProcess,
} from '@pops/pillar-sdk/testing';

import { MobileMutationsResponseSchema } from '../../../contract/mobile-inventory-mutation-schemas.js';
import { deviceRow } from '../../../db/__tests__/helpers.js';
import { devices, openBfmDb } from '../../../db/index.js';
import { mintAccessToken } from '../../auth/access-token.js';
import { MOBILE_INVENTORY_MUTATIONS_PATH } from '../../paths.js';
import { BFM_SERVICE_ACCOUNT_SCOPES } from '../../pillars/service-account.js';

const INVENTORY_PILLAR_ID = 'inventory';

const serviceAccountSchema = z.object({ plaintextKey: z.string().min(1) });
const catalogueDescriptorSchema = z.object({
  revision: z.object({
    revision: z.number().int().positive(),
    draftVersion: z.number().int().positive(),
  }),
  types: z.array(
    z.object({
      id: z.string().uuid(),
      key: z.string(),
      fields: z.array(z.object({ id: z.string().uuid(), key: z.string() })),
    })
  ),
});
const patchedCatalogueSchema = z.object({ draft: catalogueDescriptorSchema });
const itemHistorySchema = z.object({ events: z.array(z.unknown()) });

type CatalogueOperation =
  | {
      readonly kind: 'put_type';
      readonly id?: string;
      readonly key?: string;
      readonly label?: string;
    }
  | {
      readonly kind: 'put_field';
      readonly id?: string;
      readonly typeId: string;
      readonly key?: string;
      readonly label?: string;
      readonly fieldKind?: 'short_text';
      readonly cardinality?: 'one';
      readonly required?: boolean;
      readonly storage?: 'stored';
    }
  | { readonly kind: 'archive_field'; readonly id: string };

interface PublishedFixture {
  readonly authoredRevision: number;
  readonly activeRevision: number;
  readonly typeId: string;
  readonly renamedFieldId: string;
  readonly archivedFieldId: string;
}

async function parseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)}: ${JSON.stringify(body)}`);
  }
  return schema.parse(body);
}

async function mintServiceAccount(registryBaseUrl: string): Promise<string> {
  const response = await fetch(`${registryBaseUrl}/service-accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'bfm-inventory-live-seam', scopes: BFM_SERVICE_ACCOUNT_SCOPES }),
  });
  return (await parseJson(response, serviceAccountSchema)).plaintextKey;
}

function inventoryJson(
  baseUrl: string,
  apiKey: string,
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(body),
  });
}

async function publishRevision(
  baseUrl: string,
  apiKey: string,
  baseRevision: number,
  operations: readonly CatalogueOperation[]
): Promise<number> {
  const created = await createDraft(baseUrl, apiKey, baseRevision);
  const patched = await patchDraft(
    baseUrl,
    apiKey,
    baseRevision,
    created.revision.revision,
    created.revision.draftVersion,
    operations
  );
  await publishDraft(
    baseUrl,
    apiKey,
    baseRevision,
    created.revision.revision,
    patched.revision.draftVersion
  );
  return created.revision.revision;
}

async function createDraft(
  baseUrl: string,
  apiKey: string,
  baseRevision: number
): Promise<z.infer<typeof catalogueDescriptorSchema>> {
  return parseJson(
    await inventoryJson(baseUrl, apiKey, '/type-catalogue/drafts', 'POST', { baseRevision }),
    catalogueDescriptorSchema
  );
}

async function patchDraft(
  baseUrl: string,
  apiKey: string,
  baseRevision: number,
  revision: number,
  expectedDraftVersion: number,
  operations: readonly CatalogueOperation[]
): Promise<z.infer<typeof catalogueDescriptorSchema>> {
  const patched = await parseJson(
    await inventoryJson(baseUrl, apiKey, `/type-catalogue/drafts/${String(revision)}`, 'PATCH', {
      baseRevision,
      expectedDraftVersion,
      operations,
    }),
    patchedCatalogueSchema
  );
  return patched.draft;
}

async function publishDraft(
  baseUrl: string,
  apiKey: string,
  baseRevision: number,
  revision: number,
  expectedDraftVersion: number
): Promise<void> {
  await parseJson(
    await inventoryJson(
      baseUrl,
      apiKey,
      `/type-catalogue/drafts/${String(revision)}/publish`,
      'POST',
      { baseRevision, expectedDraftVersion, note: 'Offline replay live seam' }
    ),
    catalogueDescriptorSchema
  );
}

async function publishFixture(baseUrl: string, apiKey: string): Promise<PublishedFixture> {
  const created = await createDraft(baseUrl, apiKey, 1);
  const authoredRevision = created.revision.revision;
  const withType = await patchDraft(
    baseUrl,
    apiKey,
    1,
    authoredRevision,
    created.revision.draftVersion,
    [{ kind: 'put_type', key: 'offline_device', label: 'Offline device' }]
  );
  const typeId = withType.types.find((type) => type.key === 'offline_device')?.id;
  if (typeId === undefined) throw new Error('offline device type was not created');
  const withFields = await patchDraft(
    baseUrl,
    apiKey,
    1,
    authoredRevision,
    withType.revision.draftVersion,
    [
      {
        kind: 'put_field',
        typeId,
        key: 'serial',
        label: 'Serial',
        fieldKind: 'short_text',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
      {
        kind: 'put_field',
        typeId,
        key: 'legacy_tag',
        label: 'Legacy tag',
        fieldKind: 'short_text',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
    ]
  );
  const fields = withFields.types.find((type) => type.id === typeId)?.fields;
  const renamedFieldId = fields?.find((field) => field.key === 'serial')?.id;
  const archivedFieldId = fields?.find((field) => field.key === 'legacy_tag')?.id;
  if (renamedFieldId === undefined || archivedFieldId === undefined) {
    throw new Error('offline replay fields were not created');
  }
  await publishDraft(baseUrl, apiKey, 1, authoredRevision, withFields.revision.draftVersion);
  const activeRevision = await publishRevision(baseUrl, apiKey, authoredRevision, [
    { kind: 'put_field', id: renamedFieldId, typeId, label: 'Asset serial' },
    { kind: 'archive_field', id: archivedFieldId },
    {
      kind: 'put_field',
      typeId,
      key: 'replacement_tag',
      label: 'Replacement tag',
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]);
  return { authoredRevision, activeRevision, typeId, renamedFieldId, archivedFieldId };
}

function queuedCreate(
  fixture: PublishedFixture,
  fieldId: string,
  itemId: string,
  mutationId: string
): Record<string, unknown> {
  return {
    mutationId,
    op: 'item.create',
    entityId: itemId,
    baseRevision: null,
    catalogueRevision: fixture.authoredRevision,
    dependsOn: [],
    clientTime: '2026-09-23T00:00:00.000Z',
    args: {
      item: {
        name: 'Offline device',
        typeId: fixture.typeId,
        values: [{ fieldId, values: ['queued'] }],
      },
    },
  };
}

function postMutations(baseUrl: string, token: string, mutations: readonly unknown[]) {
  return fetch(`${baseUrl}${MOBILE_INVENTORY_MUTATIONS_PATH}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ mutations }),
  });
}

async function parseMutationResponse(response: Response, proxy: RecordingProxy) {
  if (!response.ok) {
    const body: unknown = await response.json();
    const upstream = proxy.requests.map(({ method, url, status, bodySnippet }) => ({
      method,
      url,
      status,
      bodySnippet,
    }));
    throw new Error(
      `BFM answered HTTP ${String(response.status)}: ${JSON.stringify(body)}; Inventory calls: ${JSON.stringify(upstream)}`
    );
  }
  return MobileMutationsResponseSchema.parse(await response.json());
}

describe('phone -> BFM -> Inventory offline catalogue replay', () => {
  let tempDir = '';
  let registryProcess: SpawnedPillarProcess | undefined;
  let inventoryProcess: SpawnedPillarProcess | undefined;
  let inventoryProxy: RecordingProxy | undefined;
  let bfmProcess: SpawnedPillarProcess | undefined;
  let deviceToken = '';
  let fixture: PublishedFixture;

  beforeAll(async () => {
    const bfmDir = resolvePillarDir(import.meta.url, 'bfm');
    const scratchRoot = join(bfmDir, '..', '..', 'tmp');
    mkdirSync(scratchRoot, { recursive: true });
    tempDir = mkdtempSync(join(scratchRoot, 'live-seam-bfm-inventory-'));

    registryProcess = await spawnPillarProcess({
      label: 'registry',
      cwd: resolvePillarDir(import.meta.url, 'registry'),
      port: await getFreePort(),
      env: { POPS_REGISTRY_ENABLED: 'true', REGISTRY_SQLITE_PATH: join(tempDir, 'registry.db') },
    });
    const bfmApiKey = await mintServiceAccount(registryProcess.baseUrl);

    const inventoryPort = await getFreePort();
    inventoryProcess = await spawnPillarProcess({
      label: 'inventory',
      cwd: resolvePillarDir(import.meta.url, INVENTORY_PILLAR_ID),
      port: inventoryPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        POPS_REGISTRY_URL: registryProcess.baseUrl,
        INVENTORY_SQLITE_PATH: join(tempDir, 'inventory.db'),
        INVENTORY_SELF_BASE_URL: `http://127.0.0.1:${String(inventoryPort)}`,
      },
    });
    await waitForRegistration(registryProcess.baseUrl, INVENTORY_PILLAR_ID);
    fixture = await publishFixture(inventoryProcess.baseUrl, bfmApiKey);
    const inventoryPreflight = await fetch(`${inventoryProcess.baseUrl}/sync/snapshot`, {
      headers: {
        'pops-inventory-protocol': '1',
        'x-api-key': bfmApiKey,
      },
    });
    if (!inventoryPreflight.ok) {
      const body: unknown = await inventoryPreflight.json();
      throw new Error(
        `Inventory sync preflight failed with HTTP ${String(inventoryPreflight.status)}: ${JSON.stringify(body)}`
      );
    }
    inventoryProxy = await startRecordingProxy(inventoryProcess.baseUrl);

    const bfmPort = await getFreePort();
    const signingSecret = randomBytes(32).toString('hex');
    bfmProcess = await spawnPillarProcess({
      label: 'bfm',
      cwd: bfmDir,
      port: bfmPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        POPS_REGISTRY_URL: registryProcess.baseUrl,
        POPS_INTERNAL_BASE_URLS: `inventory:${inventoryProxy.baseUrl}`,
        BFM_SQLITE_PATH: join(tempDir, 'bfm.db'),
        BFM_SELF_BASE_URL: `http://127.0.0.1:${String(bfmPort)}`,
        BFM_ACCESS_TOKEN_SECRET: signingSecret,
        POPS_INTERNAL_API_KEY: bfmApiKey,
      },
    });
    const opened = openBfmDb(join(tempDir, 'bfm.db'));
    const device = deviceRow();
    opened.db.insert(devices).values(device).run();
    opened.raw.close();
    deviceToken = mintAccessToken(
      device.id,
      createSecretKey(Buffer.from(signingSecret, 'utf8'))
    ).token;
  }, 60_000);

  afterAll(async () => {
    await bfmProcess?.stop();
    await inventoryProxy?.stop();
    await inventoryProcess?.stop();
    await registryProcess?.stop();
    if (tempDir !== '') rmSync(tempDir, { recursive: true, force: true });
  });

  it('rebases a rename-compatible write and replays its command idempotently', async () => {
    if (bfmProcess === undefined) throw new Error('BFM did not start');
    if (inventoryProxy === undefined) throw new Error('Inventory proxy did not start');
    const itemId = randomUUID();
    const mutation = queuedCreate(fixture, fixture.renamedFieldId, itemId, randomUUID());

    const first = await parseMutationResponse(
      await postMutations(bfmProcess.baseUrl, deviceToken, [mutation]),
      inventoryProxy
    );
    const retry = await parseMutationResponse(
      await postMutations(bfmProcess.baseUrl, deviceToken, [mutation]),
      inventoryProxy
    );

    expect(first.outcomes).toEqual([
      expect.objectContaining({ mutationId: mutation.mutationId, status: 'applied', revision: 1 }),
    ]);
    expect(retry).toEqual(first);

    const history = await parseJson(
      await fetch(`${bfmProcess.baseUrl}/mobile/inventory/items/${itemId}/history`, {
        headers: { authorization: `Bearer ${deviceToken}` },
      }),
      itemHistorySchema
    );
    expect(history.events).toHaveLength(1);
  });

  it('answers the catalogue revision the phone asked for, not the current one', async () => {
    if (bfmProcess === undefined) throw new Error('BFM did not start');
    expect(fixture.authoredRevision).not.toBe(fixture.activeRevision);

    for (const revision of [fixture.authoredRevision, fixture.activeRevision]) {
      const response = await fetch(
        `${bfmProcess.baseUrl}/mobile/inventory/type-catalogue?revision=${String(revision)}`,
        { headers: { authorization: `Bearer ${deviceToken}` } }
      );
      const body = await parseJson(
        response,
        z.object({ revision: z.object({ revision: z.number() }) })
      );
      expect(body.revision.revision, `asked for ${String(revision)}`).toBe(revision);
    }
  });

  it('returns a stable repair outcome when the authored field was archived and replaced', async () => {
    if (bfmProcess === undefined) throw new Error('BFM did not start');
    if (inventoryProxy === undefined) throw new Error('Inventory proxy did not start');
    const itemId = randomUUID();
    const mutation = queuedCreate(fixture, fixture.archivedFieldId, itemId, randomUUID());

    const first = await parseMutationResponse(
      await postMutations(bfmProcess.baseUrl, deviceToken, [mutation]),
      inventoryProxy
    );
    const retry = await parseMutationResponse(
      await postMutations(bfmProcess.baseUrl, deviceToken, [mutation]),
      inventoryProxy
    );

    expect(first.outcomes).toEqual([
      expect.objectContaining({
        mutationId: mutation.mutationId,
        status: 'rejected',
        reason: 'catalogue_repair_required',
        catalogueChanges: [
          {
            definition: 'field',
            id: fixture.archivedFieldId,
            typeId: fixture.typeId,
            fieldId: fixture.archivedFieldId,
            change: 'archived',
            replacementId: null,
            revision: fixture.activeRevision,
          },
        ],
      }),
    ]);
    expect(retry).toEqual(first);

    const history = await fetch(`${bfmProcess.baseUrl}/mobile/inventory/items/${itemId}/history`, {
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    expect(history.status).toBe(404);
  });
});
