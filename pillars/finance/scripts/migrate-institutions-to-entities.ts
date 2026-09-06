/**
 * One-shot deploy step (POPS-3062): back-fill finance's `institutions` into
 * `bank`-typed contacts Entities, re-uploading each logo through contacts'
 * own avatar store. See
 * `pillars/finance/src/api/contacts/migrate-institutions-to-entities.ts` for
 * the match/create/collision rules and the idempotency contract; this file
 * only wires that pure logic to the real finance DB and the real contacts
 * pillar. Safe to re-run to completion — a collision is reported and
 * retried on every run until a human resolves the name clash by hand.
 *
 * Invoke explicitly (never runs automatically):
 *
 *   FINANCE_DB_PATH=/path/to/finance.db \
 *   POPS_REGISTRY_URL=http://registry-api:3001 \
 *   POPS_INTERNAL_API_KEY=... \
 *   pnpm --filter @pops/finance exec tsx scripts/migrate-institutions-to-entities.ts
 *
 * DO NOT run this against a production database without the repo owner's
 * explicit go-ahead — it is a one-way write into the contacts pillar's own
 * store. It has been tested only against seeded local/temp SQLite databases.
 *
 * The avatar upload is a raw `image/*` byte stream (`PUT /entities/{id}/avatar`,
 * POPS-3061), which the typed pillar SDK proxy cannot send — it always
 * JSON-encodes the body (`libs/sdk/src/client/rest-call.ts`). That one call
 * therefore resolves contacts' base URL via the same registry discovery the
 * SDK uses internally and sends a plain authenticated `fetch`; every other
 * call goes through `pillar<ContactsRouter>('contacts')` as usual.
 */
import { HttpDiscoveryTransport } from '@pops/pillar-sdk/client';
import { isOk, pillar, resolveApiKey, SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import {
  BANK_ENTITY_TYPE,
  migrateInstitutionsToEntities,
  type EntityMatch,
  type InstitutionRecord,
  type LogoBytes,
  type MigrateInstitutionsDeps,
} from '../src/api/contacts/migrate-institutions-to-entities.js';
import {
  institutionsService,
  logoBlobsService,
  openFinanceDb,
  type OpenedFinanceDb,
} from '../src/db/index.js';

const CONTACTS_PILLAR_ID = 'contacts';
/** Matches the contacts `entities.list` page cap (`MAX_LIMIT` in its router). */
const PAGE_SIZE = 200;
/** Safety backstop against a runaway sweep — see the identical constant and
 * rationale in `src/api/contacts/client.ts`. */
const MAX_PAGES = 5000;

type ContactsEntity = {
  id: string;
  name: string;
  type: string;
  avatarAssetId: string | null;
  colour: string | null;
};

type ContactsRouter = {
  entities: {
    list: (input: {
      search?: string;
      limit: number;
      offset: number;
    }) => Promise<{ data: ContactsEntity[]; pagination: { hasMore: boolean } }>;
    get: (input: { id: string }) => Promise<{ data: ContactsEntity }>;
    create: (input: {
      name: string;
      type: string;
      colour: string;
    }) => Promise<{ data: ContactsEntity; message: string }>;
    update: (input: { id: string; colour: string }) => Promise<{ data: ContactsEntity }>;
  };
};

function toEntityMatch(entity: ContactsEntity): EntityMatch {
  return {
    id: entity.id,
    type: entity.type,
    avatarAssetId: entity.avatarAssetId,
    colour: entity.colour,
  };
}

function toInstitutionRecord(row: {
  id: string;
  name: string;
  colour: string;
  logoAssetId: string | null;
  migratedEntityId: string | null;
}): InstitutionRecord {
  return {
    id: row.id,
    name: row.name,
    colour: row.colour,
    logoAssetId: row.logoAssetId,
    migratedEntityId: row.migratedEntityId,
  };
}

/** Read the whole contacts entity set matching `search`, paging until exhausted. */
async function pageEntities(search: string): Promise<ContactsEntity[]> {
  const contacts = pillar<ContactsRouter>(CONTACTS_PILLAR_ID);
  const all: ContactsEntity[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await contacts.entities.list({
      search,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (!isOk(result)) {
      throw new Error(`contacts entities.list failed: ${result.kind}`);
    }
    all.push(...result.value.data);
    if (!result.value.pagination.hasMore) return all;
  }
  throw new Error(
    `contacts entities.list sweep hit the ${MAX_PAGES}-page safety cap for search="${search}" — refusing a TRUNCATED lookup`
  );
}

async function findEntityByName(name: string): Promise<EntityMatch | null> {
  const matches = await pageEntities(name);
  const target = name.toLowerCase();
  const found = matches.find((e) => e.name.toLowerCase() === target);
  return found ? toEntityMatch(found) : null;
}

async function getEntityById(id: string): Promise<EntityMatch | null> {
  const result = await pillar<ContactsRouter>(CONTACTS_PILLAR_ID).entities.get({ id });
  if (isOk(result)) return toEntityMatch(result.value.data);
  if (result.kind === 'not-found') return null;
  throw new Error(`contacts entities.get(${id}) failed: ${result.kind}`);
}

async function createBankEntity(name: string, colour: string): Promise<EntityMatch> {
  const result = await pillar<ContactsRouter>(CONTACTS_PILLAR_ID).entities.create({
    name,
    type: BANK_ENTITY_TYPE,
    colour,
  });
  if (!isOk(result)) {
    throw new Error(`contacts entities.create failed for "${name}": ${result.kind}`);
  }
  return toEntityMatch(result.value.data);
}

async function setEntityColour(entityId: string, colour: string): Promise<void> {
  const result = await pillar<ContactsRouter>(CONTACTS_PILLAR_ID).entities.update({
    id: entityId,
    colour,
  });
  if (!isOk(result)) {
    throw new Error(`contacts entities.update(${entityId}) failed: ${result.kind}`);
  }
}

/** Resolve contacts' current base URL off the same registry snapshot the SDK uses. */
async function resolveContactsBaseUrl(): Promise<string> {
  const snapshot = await new HttpDiscoveryTransport().fetchSnapshot();
  const contacts = snapshot.find((p) => p.pillarId === CONTACTS_PILLAR_ID);
  if (!contacts) throw new Error(`contacts is not registered with the registry`);
  return contacts.baseUrl;
}

async function uploadAvatar(entityId: string, logo: LogoBytes): Promise<void> {
  const baseUrl = await resolveContactsBaseUrl();
  const apiKey = resolveApiKey();
  const headers: Record<string, string> = { 'content-type': logo.contentType };
  if (apiKey !== undefined) headers[SERVICE_ACCOUNT_HEADER] = apiKey;

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/entities/${entityId}/avatar`, {
    method: 'PUT',
    headers,
    body: logo.data,
  });
  if (!response.ok) {
    throw new Error(
      `contacts PUT /entities/${entityId}/avatar failed: HTTP ${response.status} ${response.statusText}`
    );
  }
}

function buildDeps(financeDb: OpenedFinanceDb): MigrateInstitutionsDeps {
  return {
    async readInstitutions(): Promise<InstitutionRecord[]> {
      return institutionsService.listInstitutions(financeDb.db).map(toInstitutionRecord);
    },
    findEntityByName,
    getEntityById,
    createBankEntity,
    async fetchLogoBytes(logoAssetId: string): Promise<LogoBytes | null> {
      try {
        const blob = logoBlobsService.getLogoBlob(financeDb.db, logoAssetId);
        return { data: blob.data, contentType: blob.contentType };
      } catch {
        return null;
      }
    },
    uploadAvatar,
    setEntityColour,
    async recordMigratedEntityId(institutionId: string, entityId: string): Promise<void> {
      institutionsService.setInstitutionMigratedEntityId(financeDb.db, institutionId, entityId);
    },
  };
}

async function main(): Promise<void> {
  const dbPath = process.env['FINANCE_DB_PATH'];
  if (!dbPath) throw new Error('FINANCE_DB_PATH is required');

  const financeDb = openFinanceDb(dbPath);
  try {
    const summary = await migrateInstitutionsToEntities(buildDeps(financeDb));
    console.warn(
      `[migrate-institutions-to-entities] done — total=${summary.total} created=${summary.created} ` +
        `matched=${summary.matched} collisions=${summary.collisions} ` +
        `logosUploaded=${summary.logosUploaded} logosSkipped=${summary.logosSkipped} ` +
        `coloursSet=${summary.coloursSet} coloursSkipped=${summary.coloursSkipped}`
    );
    if (summary.collisions > 0) {
      const names = summary.results
        .filter((r) => r.outcome === 'collision')
        .map((r) => `"${r.institutionName}" (${r.institutionId})`)
        .join(', ');
      console.warn(
        `[migrate-institutions-to-entities] ${summary.collisions} institution(s) skipped as name ` +
          `collisions with a non-bank contact and need manual resolution: ${names}`
      );
    }
  } finally {
    financeDb.raw.close();
  }
}

main().catch((err: unknown) => {
  console.error(
    '[migrate-institutions-to-entities] FAILED:',
    err instanceof Error ? err.message : err
  );
  process.exitCode = 1;
});
