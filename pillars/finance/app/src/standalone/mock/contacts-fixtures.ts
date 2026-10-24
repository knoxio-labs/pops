import { CONTACT_ENTITIES } from '../fixtures/entities';

import type {
  CommitReceipt,
  ContactPointResponse,
  ImportBatch,
  PersonProfileResponse,
  ReviewDecisionReceipt,
  SourceAccountResponse,
} from '../../contacts-api/types.gen';

const [firstEntity] = CONTACT_ENTITIES;

/** Fictional contact evidence for the standalone API contract. */
export const importBatch: ImportBatch = {
  accountId: 'account-standalone',
  collectionKey: 'contacts',
  createdAt: '2026-09-05T08:00:00.000Z',
  id: 'import-standalone',
  revision: 1,
  rows: [
    {
      errors: [],
      id: 'import-row-standalone',
      ordinal: 0,
      payload: { displayName: 'Morgan Vale', name: {}, points: [] },
      processed: false,
      proposal: 'new_source',
      recordKey: 'fixture-contact',
      removed: false,
    },
  ],
};

/** Fictional contact evidence for the standalone API contract. */
export const importReceipt: CommitReceipt = {
  batchId: importBatch.id,
  revision: 2,
  rows: [
    {
      entityId: 'person-standalone',
      rowId: 'import-row-standalone',
      skipped: false,
      sourceRecordId: 'source-standalone',
    },
  ],
};

/** Fictional contact evidence for the standalone API contract. */
export const contactPoint: ContactPointResponse = {
  data: {
    id: '00000000-0000-4000-8000-000000000001',
    entityId: firstEntity?.id ?? '',
    active: true,
    preferred: true,
    kind: 'email',
    value: 'morgan@example.invalid',
    createdAt: '2026-09-05T08:00:00.000Z',
  },
};
/** Fictional contact evidence for the standalone API contract. */
export const personProfile: PersonProfileResponse = {
  data: {
    entityId: firstEntity?.id ?? '',
    name: { givenName: 'Morgan', familyName: 'Vale' },
    updatedAt: '2026-09-05T08:00:00.000Z',
  },
};
/** Fictional contact evidence for the standalone API contract. */
export const sourceAccount: SourceAccountResponse = {
  data: {
    id: '00000000-0000-4000-8000-000000000002',
    accountKey: 'standalone',
    provider: 'file',
    createdAt: '2026-09-05T08:00:00.000Z',
  },
};

/** Atomic import review receipt used by the standalone API contract. */
export const importReviewReceipt: ReviewDecisionReceipt = {
  batchId: importBatch.id,
  rowId: 'import-row-standalone',
  batchRevision: 2,
  directoryRevision: 2,
  entityId: 'person-standalone',
  operationId: null,
  pendingEntityIds: [],
  processed: true,
};
