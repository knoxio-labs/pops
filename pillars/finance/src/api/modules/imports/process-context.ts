import {
  importsService,
  transactionCorrectionsService,
  type FinanceDb,
} from '../../../db/index.js';
import { loadEntityIdentities } from '../../contacts/identity-snapshot.js';
import { getPreAcceptThreshold } from './ai-categorizer-config.js';
import { loadKnownTags, loadTagDescriptions } from './tag-management.js';

import type { ContactsClient } from '../../contacts/types.js';
import type { ProcessContext } from './types.js';

/** Fetch run-scoped reference data and a complete canonical mapping before processing import rows. */
export async function buildProcessContext(
  db: FinanceDb,
  contacts: ContactsClient,
  importBatchId: string
): Promise<ProcessContext> {
  const contactSet = await contacts.fetchAllEntities();
  const { entityLookup, aliasMap: aliases } = importsService.buildEntityMaps(contactSet);
  const identities = await loadEntityIdentities(
    db,
    contacts,
    contactSet.map((entity) => entity.id)
  );
  return {
    identities,
    entityLookup,
    aliases,
    importBatchId,
    knownTags: loadKnownTags(db),
    tagDescriptions: loadTagDescriptions(db),
    entityDefaultTags: importsService.buildDefaultTagsByEntity(contactSet),
    correctionRules: transactionCorrectionsService.listTransactionCorrections(db, {
      limit: 50_000,
      offset: 0,
    }).rows,
    preAcceptThreshold: getPreAcceptThreshold(db),
  };
}
