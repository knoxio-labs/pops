/**
 * Integration-style tests for the finance→contacts institutions migrator
 * (POPS-3062).
 *
 * The finance side is real: institutions and their logo bytes live in a
 * fresh, fully-migrated temp finance SQLite database (`freshMigratedFinanceDb`,
 * the same harness finance's own DB service tests use), read and written
 * through the real `institutionsService`/`logoBlobsService`. The contacts
 * side is faked in-memory — this repo's established pattern at the
 * finance→contacts HTTP boundary (see `contacts-fake.ts`, used by every other
 * finance test that talks to contacts): contacts is a separate Rust service
 * over HTTP, and nothing in this repo spins up a live cross-pillar server
 * for a TS test suite, so a fake standing in for the wire boundary is what
 * "mock nothing that can be real" means here — the finance-owned half (the DB)
 * is real, the foreign half (another pillar's HTTP API) is not.
 *
 * Covers every rule from the ticket: fresh creation, match-existing,
 * collision skip (a non-bank entity with the same name), already-migrated
 * idempotency (both via a prior `migratedEntityId` and via a same-named
 * pre-existing bank entity), logo/colour idempotency (never re-uploaded or
 * clobbered), and a null-logo institution.
 */
import { describe, expect, it } from 'vitest';

import { freshMigratedFinanceDb } from '../../db/__tests__/migrated-db.js';
import { institutionsService, logoBlobsService, type FinanceDb } from '../../db/index.js';
import {
  migrateInstitutionsToEntities,
  type EntityMatch,
  type InstitutionRecord,
  type LogoBytes,
  type MigrateInstitutionsDeps,
} from '../contacts/migrate-institutions-to-entities.js';

/** In-memory fake of the contacts entity store this migration talks to. */
function makeContactsFake() {
  const entities = new Map<string, EntityMatch>();
  const names = new Map<string, string>(); // lowercase name -> id

  let nextId = 0;
  const uploads: { entityId: string; logo: LogoBytes }[] = [];
  const coloursSet: { entityId: string; colour: string }[] = [];
  const created: { name: string; colour: string }[] = [];

  return {
    entities,
    uploads,
    coloursSet,
    created,
    seedNamed(name: string, entity: EntityMatch): void {
      entities.set(entity.id, entity);
      names.set(name.toLowerCase(), entity.id);
    },
    deps: {
      async findEntityByName(name: string): Promise<EntityMatch | null> {
        const id = names.get(name.toLowerCase());
        return id ? { ...entities.get(id)! } : null;
      },
      async getEntityById(id: string): Promise<EntityMatch | null> {
        const entity = entities.get(id);
        return entity ? { ...entity } : null;
      },
      async createBankEntity(name: string, colour: string): Promise<EntityMatch> {
        created.push({ name, colour });
        const entity: EntityMatch = {
          id: `entity-${++nextId}`,
          type: 'bank',
          avatarAssetId: null,
          colour: null,
        };
        entities.set(entity.id, entity);
        names.set(name.toLowerCase(), entity.id);
        return { ...entity };
      },
      async uploadAvatar(entityId: string, logo: LogoBytes): Promise<void> {
        uploads.push({ entityId, logo });
        const entity = entities.get(entityId);
        if (!entity) throw new Error(`no such entity ${entityId}`);
        entity.avatarAssetId = `blob-${entityId}`;
      },
      async setEntityColour(entityId: string, colour: string): Promise<void> {
        coloursSet.push({ entityId, colour });
        const entity = entities.get(entityId);
        if (!entity) throw new Error(`no such entity ${entityId}`);
        entity.colour = colour;
      },
    } satisfies Pick<
      MigrateInstitutionsDeps,
      'findEntityByName' | 'getEntityById' | 'createBankEntity' | 'uploadAvatar' | 'setEntityColour'
    >,
  };
}

/** Wire the finance-DB-backed half of the deps directly against a real db. */
function financeDeps(
  db: FinanceDb
): Pick<MigrateInstitutionsDeps, 'readInstitutions' | 'fetchLogoBytes' | 'recordMigratedEntityId'> {
  return {
    async readInstitutions(): Promise<InstitutionRecord[]> {
      return institutionsService.listInstitutions(db).map((row) => ({
        id: row.id,
        name: row.name,
        colour: row.colour,
        logoAssetId: row.logoAssetId,
        migratedEntityId: row.migratedEntityId,
      }));
    },
    async fetchLogoBytes(logoAssetId: string): Promise<LogoBytes | null> {
      try {
        const blob = logoBlobsService.getLogoBlob(db, logoAssetId);
        return { data: blob.data, contentType: blob.contentType };
      } catch {
        return null;
      }
    },
    async recordMigratedEntityId(institutionId: string, entityId: string): Promise<void> {
      institutionsService.setInstitutionMigratedEntityId(db, institutionId, entityId);
    },
  };
}

/**
 * A fresh finance DB, minus the baseline `Amex`/`ANZ` institutions and their
 * accounts that `migrations/0083_accounts.sql` seeds into every install.
 * Deleted with raw SQL rather than `institutionsService.deleteInstitution`
 * (which would refuse — the seeded accounts reference them) because this is
 * fixture cleanup, not something the migrator itself needs to tolerate: every
 * test below wants a clean institution set it fully controls.
 */
function setup() {
  const { db, raw } = freshMigratedFinanceDb();
  raw.exec('DELETE FROM accounts; DELETE FROM institutions;');
  const contacts = makeContactsFake();
  const deps: MigrateInstitutionsDeps = { ...financeDeps(db), ...contacts.deps };
  return { db, contacts, deps };
}

function createInstitution(
  db: FinanceDb,
  input: { name: string; colour: string; logoAssetId?: string | null }
) {
  return institutionsService.createInstitution(db, {
    name: input.name,
    colour: input.colour,
    logoAssetId: input.logoAssetId ?? null,
  });
}

const PNG_BYTES = Buffer.from('fake-png-bytes');

describe('migrateInstitutionsToEntities', () => {
  it('creates a bank entity and uploads the logo for a fresh institution', async () => {
    const { db, contacts, deps } = setup();
    const logo = logoBlobsService.createLogoBlob(db, {
      contentType: 'image/png',
      data: PNG_BYTES,
    });
    const institution = createInstitution(db, {
      name: 'Westpac',
      colour: '#d5001c',
      logoAssetId: logo.id,
    });

    const summary = await migrateInstitutionsToEntities(deps);

    expect(summary).toMatchObject({
      total: 1,
      created: 1,
      matched: 0,
      collisions: 0,
      logosUploaded: 1,
      logosSkipped: 0,
      coloursSet: 1,
      coloursSkipped: 0,
    });
    expect(contacts.created).toEqual([{ name: 'Westpac', colour: '#d5001c' }]);
    expect(contacts.uploads).toHaveLength(1);
    expect(contacts.uploads[0]?.logo.data.equals(PNG_BYTES)).toBe(true);
    expect(contacts.uploads[0]?.logo.contentType).toBe('image/png');

    const refetched = institutionsService.getInstitution(db, institution.id);
    expect(refetched.migratedEntityId).toEqual(expect.any(String));
  });

  it('skips the logo for an institution with no logoAssetId', async () => {
    const { db, deps } = setup();
    createInstitution(db, { name: 'CashOnly Bank', colour: '#000000' });

    const summary = await migrateInstitutionsToEntities(deps);

    expect(summary).toMatchObject({
      created: 1,
      logosUploaded: 0,
      logosSkipped: 1,
      coloursSet: 1,
    });
  });

  it('matches an existing bank-typed entity by exact case-insensitive name instead of creating a duplicate', async () => {
    const { db, contacts, deps } = setup();
    contacts.seedNamed('anz', {
      id: 'existing-bank',
      type: 'bank',
      avatarAssetId: null,
      colour: null,
    });
    createInstitution(db, { name: 'ANZ', colour: '#0033a0' });

    const summary = await migrateInstitutionsToEntities(deps);

    expect(summary).toMatchObject({ created: 0, matched: 1, collisions: 0 });
    expect(contacts.created).toEqual([]);
    expect(contacts.coloursSet).toEqual([{ entityId: 'existing-bank', colour: '#0033a0' }]);
  });

  it('skips a name collision with a non-bank entity, reports it, and touches nothing', async () => {
    const { db, contacts, deps } = setup();
    contacts.seedNamed('macquarie', {
      id: 'person-1',
      type: 'person',
      avatarAssetId: null,
      colour: null,
    });
    const institution = createInstitution(db, { name: 'Macquarie', colour: '#00558c' });

    const summary = await migrateInstitutionsToEntities(deps);

    expect(summary).toMatchObject({ created: 0, matched: 0, collisions: 1 });
    expect(summary.results).toEqual([
      {
        institutionId: institution.id,
        institutionName: 'Macquarie',
        outcome: 'collision',
        entityId: null,
        logoUploaded: false,
        colourSet: false,
      },
    ]);
    expect(contacts.created).toEqual([]);
    expect(contacts.coloursSet).toEqual([]);
    const refetched = institutionsService.getInstitution(db, institution.id);
    expect(refetched.migratedEntityId).toBeNull();
    // The person entity itself is untouched.
    expect(await contacts.deps.getEntityById('person-1')).toEqual({
      id: 'person-1',
      type: 'person',
      avatarAssetId: null,
      colour: null,
    });
  });

  it('a re-run finds the collision unresolved and reports it again', async () => {
    const { db, contacts, deps } = setup();
    contacts.seedNamed('macquarie', {
      id: 'person-1',
      type: 'person',
      avatarAssetId: null,
      colour: null,
    });
    createInstitution(db, { name: 'Macquarie', colour: '#00558c' });

    await migrateInstitutionsToEntities(deps);
    const second = await migrateInstitutionsToEntities(deps);

    expect(second.collisions).toBe(1);
    expect(contacts.created).toEqual([]);
  });

  it('is fully idempotent across two runs: no duplicate entity, no re-upload, no re-set colour', async () => {
    const { db, contacts, deps } = setup();
    const logo = logoBlobsService.createLogoBlob(db, {
      contentType: 'image/jpeg',
      data: PNG_BYTES,
    });
    createInstitution(db, { name: 'Westpac', colour: '#d5001c', logoAssetId: logo.id });

    const first = await migrateInstitutionsToEntities(deps);
    const second = await migrateInstitutionsToEntities(deps);

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.matched).toBe(1);
    expect(contacts.created).toHaveLength(1);
    expect(contacts.uploads).toHaveLength(1); // not re-uploaded
    expect(contacts.coloursSet).toHaveLength(1); // not re-set
    expect(second).toMatchObject({
      logosUploaded: 0,
      logosSkipped: 1,
      coloursSet: 0,
      coloursSkipped: 1,
    });
  });

  it('picks up a prior partial run via migratedEntityId directly, without a name lookup', async () => {
    const { db, contacts, deps } = setup();
    contacts.seedNamed('nab', {
      id: 'already-migrated',
      type: 'bank',
      avatarAssetId: 'blob-existing',
      colour: '#f37021',
    });
    const institution = createInstitution(db, { name: 'NAB', colour: '#f37021' });
    institutionsService.setInstitutionMigratedEntityId(db, institution.id, 'already-migrated');

    const summary = await migrateInstitutionsToEntities(deps);

    expect(summary).toMatchObject({
      created: 0,
      matched: 1,
      logosUploaded: 0,
      logosSkipped: 1,
      coloursSet: 0,
      coloursSkipped: 1,
    });
    expect(contacts.created).toEqual([]);
    expect(contacts.uploads).toEqual([]);
    expect(contacts.coloursSet).toEqual([]);
  });

  it('never clobbers an avatar or colour a user set after migration', async () => {
    const { db, contacts, deps } = setup();
    const logo = logoBlobsService.createLogoBlob(db, {
      contentType: 'image/png',
      data: PNG_BYTES,
    });
    contacts.seedNamed('bendigo bank', {
      id: 'user-edited',
      type: 'bank',
      avatarAssetId: 'user-uploaded-blob',
      colour: '#123456',
    });
    createInstitution(db, { name: 'Bendigo Bank', colour: '#ffcc00', logoAssetId: logo.id });

    await migrateInstitutionsToEntities(deps);

    expect(contacts.uploads).toEqual([]);
    expect(contacts.coloursSet).toEqual([]);
    const entity = await contacts.deps.getEntityById('user-edited');
    expect(entity).toEqual({
      id: 'user-edited',
      type: 'bank',
      avatarAssetId: 'user-uploaded-blob',
      colour: '#123456',
    });
  });

  it('handles an empty institution set', async () => {
    const { deps } = setup();
    const summary = await migrateInstitutionsToEntities(deps);
    expect(summary).toMatchObject({
      total: 0,
      created: 0,
      matched: 0,
      collisions: 0,
      logosUploaded: 0,
      logosSkipped: 0,
    });
    expect(summary.results).toEqual([]);
  });

  it('processes multiple institutions independently in one run', async () => {
    const { db, contacts, deps } = setup();
    contacts.seedNamed('macquarie', {
      id: 'person-1',
      type: 'person',
      avatarAssetId: null,
      colour: null,
    });
    createInstitution(db, { name: 'Westpac', colour: '#d5001c' });
    createInstitution(db, { name: 'Macquarie', colour: '#00558c' });
    createInstitution(db, { name: 'ANZ', colour: '#0033a0' });

    const summary = await migrateInstitutionsToEntities(deps);

    expect(summary.total).toBe(3);
    expect(summary.created).toBe(2);
    expect(summary.collisions).toBe(1);
  });
});
