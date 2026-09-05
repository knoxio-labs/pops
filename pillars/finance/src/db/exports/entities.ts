/**
 * Finance's side of the entity (contact) relationship: usage counts, the
 * outbox that pre-creates pending contacts in the contacts pillar, orphan
 * repair, and the cross-pillar reads those depend on.
 *
 * One of the groups re-exported by `../index.ts` — see that file's header for
 * why the barrel is split rather than flat.
 */
export * as crossPillarService from '../services/cross-pillar.js';

export { listEntityUsage } from '../services/entity-usage.js';

export type {
  EntityUsageRow,
  EntityUsageListResult,
  ListEntityUsageOptions,
} from '../services/entity-usage.js';

export * as entityPrecreateOutboxService from '../services/entity-precreate-outbox.js';

export {
  PENDING_CONTACT_ID_PREFIX,
  buildPendingContactId,
  isPendingContactId,
  type EntityPrecreateOutboxRow,
  type EnqueuePendingContactInput,
  type ReassignEntityIdCounts,
} from '../services/entity-precreate-outbox.js';

export * as entityOrphansService from '../services/entity-orphans.js';

export type {
  LiveEntityRef,
  DistinctEntityRef,
  EntityRepairPlan,
  OrphanRowCounts,
  EntityRepairResult,
} from '../services/entity-orphans.js';
