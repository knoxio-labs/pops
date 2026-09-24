import {
  activateMinimumProtocol,
  PERSISTED_CATALOGUE_PROTOCOL,
  readMinimumProtocol,
} from '../../protocol/rollout.js';

import type { CommandDb } from '../../domain/commands/entities.js';

/**
 * Raises the persisted sync minimum to the protocol that carries every primitive
 * kind, as the owner does before publishing vocabulary the base catalogue never used.
 */
export function activatePersistedCatalogueProtocol(db: CommandDb): void {
  activateMinimumProtocol(db, readMinimumProtocol(db), PERSISTED_CATALOGUE_PROTOCOL);
}
