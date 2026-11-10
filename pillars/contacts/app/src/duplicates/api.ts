import {
  entitiesGet,
  entitiesPointsList,
  entitiesResolve,
  entitiesSourcesList,
  mergesMerge,
  sourcesAccountsList,
} from '../contacts-api/sdk.gen';
import { contactRequest } from '../request';

import type {
  ContactPoint,
  Entity,
  MergeResult,
  SourceAccount,
  SourceRecord,
} from '../contacts-api/types.gen';

/** Contact details and any source provenance the published API exposes for review. */
export interface DuplicateSourceSnapshot {
  entity: Entity;
  points: ContactPoint[];
  sources: SourceRecord[];
  accounts: SourceAccount[];
}

/** Adapter for person source evidence and explicit identity merge operations. */
export interface DuplicateMergeGateway {
  load: (id: string) => Promise<DuplicateSourceSnapshot>;
  merge: (
    canonicalId: string,
    memberId: string,
    evidence: string,
    idempotencyKey: string
  ) => Promise<MergeResult>;
}

/** Read person-only source evidence and merge two explicitly selected current roots. */
export const duplicateMergeGateway: DuplicateMergeGateway = {
  async load(id) {
    const { data: entity } = await contactRequest(() => entitiesGet({ path: { id } }));
    const [points, sources, accounts] = await Promise.all([
      ['person', 'company', 'organisation'].includes(entity.type)
        ? contactRequest(() => entitiesPointsList({ path: { id } })).then((result) => result.data)
        : Promise.resolve([]),
      entity.type === 'person'
        ? contactRequest(() => entitiesSourcesList({ path: { id } })).then((result) => result.data)
        : Promise.resolve([]),
      entity.type === 'person'
        ? contactRequest(() => sourcesAccountsList()).then((result) => result.data)
        : Promise.resolve([]),
    ]);
    return { entity, points, sources, accounts };
  },
  async merge(canonicalId, memberId, evidence, idempotencyKey) {
    const resolution = await contactRequest(() =>
      entitiesResolve({ body: { ids: [canonicalId, memberId] } })
    );
    if (resolution.data.some((entry) => entry.canonicalId !== entry.id)) {
      throw new Error('A selected contact changed identity. Search again before merging.');
    }
    const result = await contactRequest(() =>
      mergesMerge({
        body: {
          canonicalId,
          memberIds: [memberId],
          expectedRevision: resolution.revision,
          idempotencyKey,
          evidence,
        },
      })
    );
    return result;
  },
};
