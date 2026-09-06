/**
 * The contacts-pillar half of `migrate-institutions-to-entities.ts`, split
 * into its own file to keep that script under this repo's per-file line cap
 * (`scripts/ci/check-line-budget-headroom.mjs` warns a near-cap file into a
 * merge-queue ejection risk — POPS-3026).
 *
 * Every call except the avatar upload goes through the typed pillar SDK
 * proxy (`pillar<ContactsRouter>('contacts')`). The avatar upload is a raw
 * `image/*` byte stream (`PUT /entities/{id}/avatar`, POPS-3061), which that
 * proxy cannot send — it always JSON-encodes the body
 * (`libs/sdk/src/client/rest-call.ts`) — so it resolves contacts' base URL
 * off the same registry discovery the SDK uses internally and sends a plain
 * authenticated `fetch` instead.
 */
import { HttpDiscoveryTransport } from '@pops/pillar-sdk/client';
import { isOk, pillar, resolveApiKey, SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import {
  BANK_ENTITY_TYPE,
  type EntityMatch,
  type LogoBytes,
} from '../src/api/contacts/migrate-institutions-to-entities.js';

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
  aliases: string[];
  avatarAssetId: string | null;
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
    }) => Promise<{ data: ContactsEntity; message: string }>;
  };
};

function toEntityMatch(entity: ContactsEntity): EntityMatch {
  return {
    id: entity.id,
    type: entity.type,
    avatarAssetId: entity.avatarAssetId,
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

/**
 * Resolve a single contacts entity by exact (case-insensitive) name OR
 * alias, mirroring `fetchByExactName` in `src/api/contacts/client.ts`: an
 * alias counts as the entity's name, so a bank whose name matches only an
 * existing entity's alias must resolve to that entity rather than being
 * read as unknown and migrated into a duplicate. A name match still wins
 * over an alias match.
 */
export async function findEntityByName(name: string): Promise<EntityMatch | null> {
  const matches = await pageEntities(name);
  const target = name.toLowerCase();
  const found =
    matches.find((e) => e.name.toLowerCase() === target) ??
    matches.find((e) => e.aliases.some((alias) => alias.toLowerCase() === target)) ??
    null;
  return found ? toEntityMatch(found) : null;
}

export async function getEntityById(id: string): Promise<EntityMatch | null> {
  const result = await pillar<ContactsRouter>(CONTACTS_PILLAR_ID).entities.get({ id });
  if (isOk(result)) return toEntityMatch(result.value.data);
  if (result.kind === 'not-found') return null;
  throw new Error(`contacts entities.get(${id}) failed: ${result.kind}`);
}

export async function createBankEntity(name: string): Promise<EntityMatch> {
  const result = await pillar<ContactsRouter>(CONTACTS_PILLAR_ID).entities.create({
    name,
    type: BANK_ENTITY_TYPE,
  });
  if (!isOk(result)) {
    throw new Error(`contacts entities.create failed for "${name}": ${result.kind}`);
  }
  return toEntityMatch(result.value.data);
}

/** Resolve contacts' current base URL off the same registry snapshot the SDK uses. */
async function resolveContactsBaseUrl(): Promise<string> {
  const snapshot = await new HttpDiscoveryTransport().fetchSnapshot();
  const contacts = snapshot.find((p) => p.pillarId === CONTACTS_PILLAR_ID);
  if (!contacts) throw new Error(`contacts is not registered with the registry`);
  return contacts.baseUrl;
}

export async function uploadAvatar(entityId: string, logo: LogoBytes): Promise<void> {
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
