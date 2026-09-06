/**
 * One-shot, IDEMPOTENT migrator: back-fill finance's `institutions` rows into
 * `bank`-typed contacts Entities (POPS-3062), re-uploading each institution's
 * logo through contacts' own avatar store rather than copying the asset id
 * string — finance's and contacts' blob stores are separate, so
 * `institutions.logoAssetId` is meaningless outside finance. Does NOT
 * auto-run; it is invoked explicitly by `scripts/migrate-institutions-to-entities.ts`.
 *
 * Match-or-create, by exact case-insensitive name:
 *   - a prior partial run recorded `migratedEntityId` — reuse that entity
 *     directly (this is the fast, authoritative path a re-run takes);
 *   - otherwise, an existing `bank`-typed entity with the same name is the
 *     target (idempotent re-run safety for a partial run that created the
 *     entity but crashed before recording `migratedEntityId`);
 *   - a NON-bank entity with the same name (e.g. a person or company that
 *     happens to share the bank's name) is a COLLISION: this migration must
 *     never silently repoint or merge into it, because doing so would staple
 *     a bank's logo/colour onto an unrelated contact. The institution is
 *     skipped and reported so a human can resolve the name clash by hand
 *     (rename one side, or decide they really are the same entity); nothing
 *     about resolving that requires this migration to run again first — the
 *     institution just isn't touched until then;
 *   - otherwise, create a new `bank`-typed entity.
 *
 * Logo and colour are copied idempotently: a null `logoAssetId` is skipped
 * outright, and an entity that already has an avatar (from an earlier run,
 * OR because a user set one by hand after migrating) is never re-uploaded or
 * clobbered. Colour follows the same rule — set only when the entity has
 * none yet.
 */

/** A finance `institutions` row, in the shape the migrator needs. */
export interface InstitutionRecord {
  id: string;
  name: string;
  colour: string;
  logoAssetId: string | null;
  migratedEntityId: string | null;
}

/** The logo bytes read out of finance's own blob store. */
export interface LogoBytes {
  data: Buffer;
  contentType: string;
}

/** The slice of a contacts Entity the migrator reads to decide what to do. */
export interface EntityMatch {
  id: string;
  type: string;
  avatarAssetId: string | null;
  colour: string | null;
}

export type InstitutionOutcome = 'created' | 'matched' | 'collision';

/** One line of the end-of-run report, one per institution processed. */
export interface InstitutionResult {
  institutionId: string;
  institutionName: string;
  outcome: InstitutionOutcome;
  entityId: string | null;
  logoUploaded: boolean;
  colourSet: boolean;
}

export interface MigrationSummary {
  total: number;
  created: number;
  matched: number;
  collisions: number;
  logosUploaded: number;
  logosSkipped: number;
  coloursSet: number;
  coloursSkipped: number;
  results: InstitutionResult[];
}

/** The injectable seam every step of the migration depends on. */
export interface MigrateInstitutionsDeps {
  /** The full finance `institutions` set. */
  readInstitutions(): Promise<InstitutionRecord[]>;
  /**
   * Resolve a contacts Entity by exact, case-insensitive name — of ANY type,
   * so the migrator can tell a same-name bank (reuse) from a same-name
   * non-bank (collision) apart. `null` when no entity has that name.
   */
  findEntityByName(name: string): Promise<EntityMatch | null>;
  /**
   * Resolve a contacts Entity by id — used to re-check the target of a
   * prior partial run's `migratedEntityId` before touching it again. `null`
   * when the id no longer resolves (the entity was deleted out from under
   * the migration), which the orchestration below treats as "not migrated
   * after all" and falls back to the by-name lookup.
   */
  getEntityById(id: string): Promise<EntityMatch | null>;
  /** Create a new `bank`-typed entity with `name`/`colour`. */
  createBankEntity(name: string, colour: string): Promise<EntityMatch>;
  /** Read an institution's logo bytes out of finance's blob store. */
  fetchLogoBytes(logoAssetId: string): Promise<LogoBytes | null>;
  /** Upload `logo` as the entity's avatar through contacts' own upload route. */
  uploadAvatar(entityId: string, logo: LogoBytes): Promise<void>;
  /** Set an entity's `colour`. */
  setEntityColour(entityId: string, colour: string): Promise<void>;
  /** Record the institution → entity mapping back into finance's own DB. */
  recordMigratedEntityId(institutionId: string, entityId: string): Promise<void>;
}

/** The contacts entity `type` value institutions are migrated into. */
export const BANK_ENTITY_TYPE = 'bank';

type TargetResolution =
  | { kind: 'target'; outcome: 'created' | 'matched'; entity: EntityMatch }
  | { kind: 'collision' };

/**
 * Resolve the contacts Entity `institution` should migrate onto, per the
 * match/create/collision rules in this module's header comment. Never
 * writes anything — callers apply the resolution.
 */
async function resolveTarget(
  institution: InstitutionRecord,
  deps: MigrateInstitutionsDeps
): Promise<TargetResolution> {
  if (institution.migratedEntityId !== null) {
    const entity = await deps.getEntityById(institution.migratedEntityId);
    if (entity !== null) return { kind: 'target', outcome: 'matched', entity };
    // The recorded target no longer exists — fall through to a fresh
    // by-name resolution rather than failing the whole run over one
    // dangling id.
  }

  const existing = await deps.findEntityByName(institution.name);
  if (existing === null) {
    const created = await deps.createBankEntity(institution.name, institution.colour);
    return { kind: 'target', outcome: 'created', entity: created };
  }
  if (existing.type !== BANK_ENTITY_TYPE) {
    return { kind: 'collision' };
  }
  return { kind: 'target', outcome: 'matched', entity: existing };
}

/**
 * Copy `institution`'s logo onto `entity`'s avatar, idempotently: a null
 * `logoAssetId` or an entity that already has an avatar is left alone.
 * Returns whether an upload actually happened.
 */
async function migrateLogo(
  institution: InstitutionRecord,
  entity: EntityMatch,
  deps: MigrateInstitutionsDeps
): Promise<boolean> {
  if (institution.logoAssetId === null) return false;
  if (entity.avatarAssetId !== null) return false;

  const logo = await deps.fetchLogoBytes(institution.logoAssetId);
  if (logo === null) return false;

  await deps.uploadAvatar(entity.id, logo);
  return true;
}

/**
 * Copy `institution`'s colour onto `entity`, idempotently: an entity that
 * already carries a colour (from an earlier run, or a user's own edit since)
 * is left alone. Returns whether a write actually happened.
 */
async function migrateColour(
  institution: InstitutionRecord,
  entity: EntityMatch,
  deps: MigrateInstitutionsDeps
): Promise<boolean> {
  if (entity.colour !== null && entity.colour !== '') return false;
  await deps.setEntityColour(entity.id, institution.colour);
  return true;
}

/**
 * Run the migration end to end: read every institution, resolve/create its
 * bank entity, copy the logo and colour idempotently, and record the
 * mapping. A collision skips the institution entirely — no entity write, no
 * logo/colour write, no `migratedEntityId` recorded — so a re-run keeps
 * retrying it (and keeps reporting it) until a human resolves the name
 * clash.
 */
export async function migrateInstitutionsToEntities(
  deps: MigrateInstitutionsDeps
): Promise<MigrationSummary> {
  const institutions = await deps.readInstitutions();
  const summary: MigrationSummary = {
    total: institutions.length,
    created: 0,
    matched: 0,
    collisions: 0,
    logosUploaded: 0,
    logosSkipped: 0,
    coloursSet: 0,
    coloursSkipped: 0,
    results: [],
  };

  for (const institution of institutions) {
    const resolution = await resolveTarget(institution, deps);

    if (resolution.kind === 'collision') {
      summary.collisions++;
      summary.results.push({
        institutionId: institution.id,
        institutionName: institution.name,
        outcome: 'collision',
        entityId: null,
        logoUploaded: false,
        colourSet: false,
      });
      continue;
    }

    const { entity, outcome } = resolution;
    if (outcome === 'created') summary.created++;
    else summary.matched++;

    const logoUploaded = await migrateLogo(institution, entity, deps);
    if (logoUploaded) summary.logosUploaded++;
    else summary.logosSkipped++;

    const colourSet = await migrateColour(institution, entity, deps);
    if (colourSet) summary.coloursSet++;
    else summary.coloursSkipped++;

    await deps.recordMigratedEntityId(institution.id, entity.id);

    summary.results.push({
      institutionId: institution.id,
      institutionName: institution.name,
      outcome,
      entityId: entity.id,
      logoUploaded,
      colourSet,
    });
  }

  return summary;
}
