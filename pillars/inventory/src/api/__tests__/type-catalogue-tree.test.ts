import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type {
  ServiceAccountPrincipal,
  ServiceAccountVerification,
  ServiceAccountVerifier,
} from '@pops/pillar-sdk/server';

import type { InventoryIdentityResolver } from '../middleware/identity.js';

const transport = createTestTransport();
const OWNER_EMAIL = 'owner@example.com';
const SERVICE_KEY = 'pops_sa_catalogue_tree.not-a-real-secret';
const PRIMITIVE_KINDS = [
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'enum',
  'measurement',
  'date',
  'date_time',
  'url',
  'reference',
] as const;

interface RevisionBody {
  readonly revision: number;
  readonly draftVersion: number;
  readonly minimumProtocol: number;
  readonly status: string;
}

interface FieldBody {
  readonly id: string;
  readonly key: string;
  readonly kind: string;
  readonly required: boolean;
}

interface TypeBody {
  readonly id: string;
  readonly key: string;
  readonly parentTypeId: string | null;
  readonly archivedAt: string | null;
  readonly fields: FieldBody[];
}

interface CatalogueBody {
  readonly revision: RevisionBody;
  readonly types: TypeBody[];
}

interface CompatibilityChangeBody {
  readonly classification: string;
  readonly definitionId: string;
  readonly code: string;
}

interface DraftBody extends CatalogueBody {
  readonly compatibility?: {
    readonly classification: string;
    readonly changes: CompatibilityChangeBody[];
  };
}

interface IssueBody {
  readonly definitionId: string | null;
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly issues: IssueBody[];
}

interface DraftResponseBody {
  readonly draft: DraftBody;
  readonly compatibility: {
    readonly classification: string;
    readonly changes: CompatibilityChangeBody[];
  };
}

interface DraftContext {
  readonly api: BoundAgent;
  readonly baseRevision: number;
  readonly revision: number;
  readonly draftVersion: number;
}

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

function servicePrincipal(scopes: readonly string[]): ServiceAccountPrincipal {
  return { id: 'sa_catalogue_tree', name: 'catalogue-tree-editor', scopes };
}

function verifier(scopes: readonly string[]): ServiceAccountVerifier {
  const verification: ServiceAccountVerification = {
    outcome: 'authenticated',
    principal: servicePrincipal(scopes),
  };
  return (key) => Promise.resolve(key === SERVICE_KEY ? verification : { outcome: 'rejected' });
}

function identity(
  mode: 'web' | 'service' | 'none',
  scopes: readonly string[] = []
): InventoryIdentityResolver {
  return async (request) => {
    if (mode === 'service' && request.get('x-api-key') === SERVICE_KEY) {
      return { user: null, serviceAccount: servicePrincipal(scopes) };
    }
    if (mode === 'web') return { user: { email: OWNER_EMAIL }, serviceAccount: null };
    return { user: null, serviceAccount: null };
  };
}

function apiFor(mode: 'web' | 'service' | 'none', scopes: readonly string[] = []): BoundAgent {
  const app = createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    serviceAccountVerifier: verifier(scopes),
    identityResolver: identity(mode, scopes),
    documents: {
      getPaperlessStatus: () =>
        Promise.resolve({ configured: false, available: false, baseUrl: null }),
      searchPaperlessDocuments: () => Promise.resolve([]),
    },
  });
  return transport.requestOn(app);
}

async function createDraft(api: BoundAgent): Promise<DraftContext> {
  const currentResponse = await api.get('/type-catalogue');
  const current: CatalogueBody = currentResponse.body;
  const response = await api
    .post('/type-catalogue/drafts')
    .send({ baseRevision: current.revision.revision });
  if (response.status !== 201) throw new Error(JSON.stringify(response.body));
  const draft: CatalogueBody = response.body;
  return {
    api,
    baseRevision: current.revision.revision,
    revision: draft.revision.revision,
    draftVersion: draft.revision.draftVersion,
  };
}

async function patchDraft(
  context: DraftContext,
  operations: readonly Record<string, unknown>[]
): Promise<{ context: DraftContext; response: Awaited<ReturnType<BoundAgent['patch']>> }> {
  const response = await context.api.patch(`/type-catalogue/drafts/${context.revision}`).send({
    baseRevision: context.baseRevision,
    expectedDraftVersion: context.draftVersion,
    operations,
  });
  if (response.status !== 200) return { context, response };
  const body: DraftResponseBody = response.body;
  return {
    response,
    context: { ...context, draftVersion: body.draft.revision.draftVersion },
  };
}

async function createType(
  context: DraftContext,
  key: string,
  parentTypeId?: string
): Promise<{ context: DraftContext; type: TypeBody }> {
  const operation: Record<string, unknown> = { kind: 'put_type', key, label: key };
  if (parentTypeId !== undefined) operation.parentTypeId = parentTypeId;
  const result = await patchDraft(context, [operation]);
  if (result.response.status !== 200) throw new Error(JSON.stringify(result.response.body));
  const body: DraftResponseBody = result.response.body;
  const type = body.draft.types.find((entry) => entry.key === key);
  if (type === undefined) throw new Error(`type ${key} was not created`);
  return { context: result.context, type };
}

async function publishDraft(
  context: DraftContext
): Promise<Awaited<ReturnType<BoundAgent['post']>>> {
  return context.api.post(`/type-catalogue/drafts/${context.revision}/publish`).send({
    baseRevision: context.baseRevision,
    expectedDraftVersion: context.draftVersion,
  });
}

function expectIssue(
  response: { body: ErrorBody },
  expected: { readonly code: string; readonly definitionId: string; readonly path: string }
): void {
  expect(response.body.issues).toContainEqual(expect.objectContaining(expected));
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-type-catalogue-tree-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('type catalogue parent trees', () => {
  it('includes parentTypeId on every descriptor type', async () => {
    const response = await apiFor('web').get('/type-catalogue');
    const body: CatalogueBody = response.body;

    expect(response.status).toBe(200);
    expect(body.types.every((type) => type.parentTypeId === null)).toBe(true);
  });

  it('rejects a parent cycle with its type id and parentTypeId path', async () => {
    const api = apiFor('web');
    const root = await createType(await createDraft(api), 'cycle-root');
    const child = await createType(root.context, 'cycle-child', root.type.id);
    const result = await patchDraft(child.context, [
      { kind: 'put_type', id: root.type.id, parentTypeId: child.type.id },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expect(result.response.body.code).toBe('catalogue_validation_failed');
    expectIssue(result.response, {
      code: 'type_parent_cycle',
      definitionId: root.type.id,
      path: 'parentTypeId',
    });
  });

  it('rejects a type tree at depth four', async () => {
    const api = apiFor('web');
    const root = await createType(await createDraft(api), 'depth-root');
    const first = await createType(root.context, 'depth-first', root.type.id);
    const second = await createType(first.context, 'depth-second', first.type.id);
    const result = await patchDraft(second.context, [
      { kind: 'put_type', key: 'depth-four', label: 'depth-four', parentTypeId: second.type.id },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expect(result.response.body.code).toBe('catalogue_validation_failed');
    expect(result.response.body.issues).toContainEqual(
      expect.objectContaining({ code: 'type_depth_exceeded', path: 'parentTypeId' })
    );
  });

  it('rejects an unknown parent with its type id and parentTypeId path', async () => {
    const context = await createDraft(apiFor('web'));
    const result = await patchDraft(context, [
      {
        kind: 'put_type',
        key: 'unknown-parent-child',
        label: 'unknown-parent-child',
        parentTypeId: randomUUID(),
      },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expect(result.response.body.code).toBe('catalogue_validation_failed');
    expect(result.response.body.issues).toEqual([
      expect.objectContaining({ code: 'type_parent_unknown', path: 'parentTypeId' }),
    ]);
    expect(result.response.body.issues[0].definitionId).toEqual(expect.any(String));
  });

  it('rejects a live child when its parent is archived through archive_type', async () => {
    const api = apiFor('web');
    const parent = await createType(await createDraft(api), 'archive-parent');
    const child = await createType(parent.context, 'archive-child', parent.type.id);
    const result = await patchDraft(child.context, [{ kind: 'archive_type', id: parent.type.id }]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expectIssue(result.response, {
      code: 'type_parent_archived',
      definitionId: child.type.id,
      path: 'parentTypeId',
    });
  });

  it('rejects a live child when its parent is archived through put_type', async () => {
    const api = apiFor('web');
    const parent = await createType(await createDraft(api), 'put-archive-parent');
    const child = await createType(parent.context, 'put-archive-child', parent.type.id);
    const result = await patchDraft(child.context, [
      {
        kind: 'put_type',
        id: parent.type.id,
        archivedAt: '2026-09-27T00:00:00.000Z',
      },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expectIssue(result.response, {
      code: 'type_parent_archived',
      definitionId: child.type.id,
      path: 'parentTypeId',
    });
  });

  it('rejects a child field whose key duplicates a live parent field case-insensitively', async () => {
    const api = apiFor('web');
    const parent = await createType(await createDraft(api), 'duplicate-parent');
    const withParentField = await patchDraft(parent.context, [
      {
        kind: 'put_field',
        typeId: parent.type.id,
        key: 'shared_key',
        label: 'Shared key',
        fieldKind: 'short_text',
        cardinality: 'one',
        storage: 'stored',
      },
    ]);
    const child = await createType(withParentField.context, 'duplicate-child', parent.type.id);
    const result = await patchDraft(child.context, [
      {
        kind: 'put_field',
        typeId: child.type.id,
        key: 'SHARED_KEY',
        label: 'Duplicate shared key',
        fieldKind: 'short_text',
        cardinality: 'one',
        storage: 'stored',
      },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expect(result.response.body.issues).toContainEqual(
      expect.objectContaining({ code: 'inherited_key_duplicate', path: 'key' })
    );
    expect(result.response.body.issues[0].definitionId).toEqual(expect.any(String));
  });

  it('ignores archived parent fields when checking inherited keys', async () => {
    const api = apiFor('web');
    const parent = await createType(await createDraft(api), 'archived-field-parent');
    const withParentField = await patchDraft(parent.context, [
      {
        kind: 'put_field',
        typeId: parent.type.id,
        key: 'archived_shared_key',
        label: 'Archived shared key',
        fieldKind: 'short_text',
        cardinality: 'one',
        storage: 'stored',
      },
    ]);
    expect(withParentField.response.status, JSON.stringify(withParentField.response.body)).toBe(
      200
    );
    const parentBody: DraftResponseBody = withParentField.response.body;
    const parentField = parentBody.draft.types
      .find((type) => type.id === parent.type.id)
      ?.fields.find((field) => field.key === 'archived_shared_key');
    if (parentField === undefined) throw new Error('archived parent field was not created');
    const child = await createType(withParentField.context, 'archived-field-child', parent.type.id);
    const archived = await patchDraft(child.context, [
      { kind: 'archive_field', id: parentField.id },
    ]);
    expect(archived.response.status, JSON.stringify(archived.response.body)).toBe(200);

    const result = await patchDraft(archived.context, [
      {
        kind: 'put_field',
        typeId: child.type.id,
        key: 'ARCHIVED_SHARED_KEY',
        label: 'Reused shared key',
        fieldKind: 'short_text',
        cardinality: 'one',
        storage: 'stored',
      },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(200);
  });

  it('rejects a type that names itself as its parent', async () => {
    const created = await createType(await createDraft(apiFor('web')), 'self-parent');
    const result = await patchDraft(created.context, [
      { kind: 'put_type', id: created.type.id, parentTypeId: created.type.id },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expectIssue(result.response, {
      code: 'type_parent_cycle',
      definitionId: created.type.id,
      path: 'parentTypeId',
    });
  });

  it('refuses to unarchive a child whose parent remains archived', async () => {
    const api = apiFor('web');
    const parent = await createType(await createDraft(api), 'unarchive-parent');
    const child = await createType(parent.context, 'unarchive-child', parent.type.id);
    const archived = await patchDraft(child.context, [
      { kind: 'archive_type', id: parent.type.id },
      { kind: 'archive_type', id: child.type.id },
    ]);
    expect(archived.response.status, JSON.stringify(archived.response.body)).toBe(200);

    const result = await patchDraft(archived.context, [
      { kind: 'put_type', id: child.type.id, archivedAt: null },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(400);
    expectIssue(result.response, {
      code: 'type_parent_archived',
      definitionId: child.type.id,
      path: 'parentTypeId',
    });
  });

  it('allows archiving a parent and all of its children in one patch', async () => {
    const parent = await createType(await createDraft(apiFor('web')), 'archive-together-parent');
    const child = await createType(parent.context, 'archive-together-child', parent.type.id);
    const result = await patchDraft(child.context, [
      { kind: 'archive_type', id: parent.type.id },
      { kind: 'archive_type', id: child.type.id },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(200);
    const body: DraftResponseBody = result.response.body;
    expect(body.draft.types.find((type) => type.id === parent.type.id)?.archivedAt).toEqual(
      expect.any(String)
    );
    expect(body.draft.types.find((type) => type.id === child.type.id)?.archivedAt).toEqual(
      expect.any(String)
    );
  });

  it('persists a parent update on a draft-only type', async () => {
    const parent = await createType(await createDraft(apiFor('web')), 'draft-parent');
    const child = await createType(parent.context, 'draft-child');
    const result = await patchDraft(child.context, [
      { kind: 'put_type', id: child.type.id, parentTypeId: parent.type.id },
    ]);

    expect(result.response.status, JSON.stringify(result.response.body)).toBe(200);
    const body: DraftResponseBody = result.response.body;
    expect(body.draft.types.find((type) => type.id === child.type.id)?.parentTypeId).toBe(
      parent.type.id
    );
  });

  it('forbids changing a published type parent during publication', async () => {
    const api = apiFor('web');
    const currentResponse = await api.get('/type-catalogue');
    const current: CatalogueBody = currentResponse.body;
    const parent = current.types.find((type) => type.archivedAt === null);
    const other = current.types.find((type) => type.archivedAt === null && type.id !== parent?.id);
    if (parent === undefined || other === undefined) throw new Error('base types are missing');
    const context = await createDraft(api);
    const changed = await patchDraft(context, [
      { kind: 'put_type', id: parent.id, parentTypeId: other.id },
    ]);
    expect(changed.response.status, JSON.stringify(changed.response.body)).toBe(200);

    const published = await publishDraft(changed.context);
    expect(published.status, JSON.stringify(published.body)).toBe(409);
    expect(published.body.code).toBe('catalogue_change_forbidden');
    expect(published.body.issues).toContainEqual({
      definitionId: parent.id,
      path: '$',
      code: 'published_type_parent_changed',
      message: 'published_type_parent_changed',
    });
  });

  it('reports migration through subtypes on the patch response', async () => {
    const api = apiFor('web');
    const initial = await createDraft(api);
    const parent = await createType(initial, 'migration-parent');
    const withField = await patchDraft(parent.context, [
      {
        kind: 'put_field',
        typeId: parent.type.id,
        key: 'migration_field',
        label: 'Migration field',
        fieldKind: 'short_text',
        cardinality: 'one',
        storage: 'stored',
      },
    ]);
    expect(withField.response.status, JSON.stringify(withField.response.body)).toBe(200);
    const withFieldBody: DraftResponseBody = withField.response.body;
    const field = withFieldBody.draft.types
      .find((type) => type.id === parent.type.id)
      ?.fields.find((entry) => entry.key === 'migration_field');
    if (field === undefined) throw new Error('migration field was not created');
    const published = await publishDraft(withField.context);
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    const next = await createDraft(api);
    const child = await createType(next, 'migration-child', parent.type.id);
    const changed = await patchDraft(child.context, [
      { kind: 'put_field', id: field.id, typeId: parent.type.id, required: true },
    ]);

    expect(changed.response.status, JSON.stringify(changed.response.body)).toBe(200);
    const body: DraftResponseBody = changed.response.body;
    expect(body.compatibility.classification).toBe('forbidden');
    expect(body.compatibility.changes).toContainEqual({
      classification: 'forbidden',
      definitionId: field.id,
      code: 'migration_through_subtypes_unsupported',
    });
  });

  it('requires protocol 3 before publishing a draft with a subtype', async () => {
    const api = apiFor('web');
    const parent = await createType(await createDraft(api), 'protocol-parent');
    const child = await createType(parent.context, 'protocol-child', parent.type.id);
    const published = await publishDraft(child.context);

    expect(published.status, JSON.stringify(published.body)).toBe(409);
    expect(published.body).toMatchObject({
      code: 'protocol_rollout_required',
      message: expect.stringContaining('Activate inventory protocol 3'),
    });
  });

  it('keeps a parentless primitive vocabulary addition at protocol 2', async () => {
    const api = apiFor('web');
    const currentResponse = await api.get('/type-catalogue');
    const current: CatalogueBody = currentResponse.body;
    const usedKinds = new Set(
      current.types.flatMap((type) => type.fields.map((field) => field.kind))
    );
    const kind = PRIMITIVE_KINDS.find((candidate) => !usedKinds.has(candidate));
    if (kind === undefined) throw new Error('base catalogue uses every primitive kind');

    const activated = await api.post('/type-catalogue/protocol-rollout').send({
      expectedMinimumProtocol: 1,
      minimumProtocol: 2,
    });
    expect(activated.status, JSON.stringify(activated.body)).toBe(200);

    const context = await createDraft(api);
    const type = current.types[0];
    if (type === undefined) throw new Error('base catalogue has no type');
    const operation: Record<string, unknown> = {
      kind: 'put_field',
      typeId: type.id,
      key: 'protocol-two-field',
      label: 'Protocol two field',
      fieldKind: kind,
      cardinality: 'one',
      storage: 'stored',
    };
    if (kind === 'reference') operation.referenceKinds = ['item'];
    const patched = await patchDraft(context, [operation]);
    expect(patched.response.status, JSON.stringify(patched.response.body)).toBe(200);
    const published = await publishDraft(patched.context);

    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body.revision.minimumProtocol).toBe(2);
  });
});
