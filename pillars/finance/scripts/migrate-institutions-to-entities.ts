/**
 * One-shot deploy step (POPS-3062): back-fill finance's `institutions` into
 * `bank`-typed contacts Entities, re-uploading each logo through contacts'
 * own avatar store. See
 * `pillars/finance/src/api/contacts/migrate-institutions-to-entities.ts` for
 * the match/create/collision rules and the idempotency contract, and
 * `institutions-migration-contacts-client.ts` for how the contacts calls
 * (including the raw avatar upload) are made; this file only wires that pure
 * logic to the real finance DB. Safe to re-run to completion — a collision
 * is reported and retried on every run until a human resolves the name
 * clash by hand.
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
 */
import {
  migrateInstitutionsToEntities,
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
import {
  createBankEntity,
  findEntityByName,
  getEntityById,
  setEntityColour,
  uploadAvatar,
} from './institutions-migration-contacts-client.js';

function buildDeps(financeDb: OpenedFinanceDb): MigrateInstitutionsDeps {
  return {
    async readInstitutions(): Promise<InstitutionRecord[]> {
      return institutionsService.listInstitutions(financeDb.db).map((row) => ({
        id: row.id,
        name: row.name,
        colour: row.colour,
        logoAssetId: row.logoAssetId,
        migratedEntityId: row.migratedEntityId,
      }));
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
