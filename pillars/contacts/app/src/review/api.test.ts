// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { client } from '../contacts-api/client.gen';
import { fileImportGateway } from '../imports/api';
import { reviewGateway } from './api';
import { mapReview } from './mapReview';

import type { ImportReview, ReviewCandidate } from '../contacts-api/types.gen';

const source = {
  accountId: 'account',
  active: true,
  displayName: 'Current source name',
  id: 'record',
  label: 'Address book',
  name: { givenName: 'Source', familyName: 'Person' },
  ownerEntityId: 'original-owner',
  provider: 'vcard',
  revision: 7,
};
const candidate: ReviewCandidate = {
  entityId: 'person',
  rowId: null,
  memberIds: ['person', 'original-owner'],
  name: 'Effective historical name',
  localName: 'Raw local name',
  localPersonProfile: null,
  personProfile: null,
  keepSeparate: false,
  reasons: ['email'],
  sources: [source],
  points: [
    {
      id: 'point',
      ownerEntityId: 'original-owner',
      sourceRecordId: 'record',
      kind: 'email',
      value: 'Original@Example.test',
      normalizedValue: 'original@example.test',
      countryCode: null,
      label: null,
      active: true,
      preferred: false,
    },
  ],
};
const review: ImportReview = {
  batchId: 'batch',
  batchRevision: 4,
  directoryRevision: 9,
  proposalRevision: 'global-proof',
  totalRows: 51,
  offset: 50,
  limit: 50,
  counts: { automatic: 20, review: 30, new: 1, invalid: 0 },
  source,
  rows: [
    {
      rowId: 'row-51',
      incoming: { name: { givenName: 'Incoming' }, points: [] },
      entityId: null,
      ownerEntityId: null,
      sourceRecordId: null,
      processed: false,
      proposal: 'new_source',
      errors: [],
      classification: 'review',
      reason: 'email',
      proposalRevision: 'row-proof',
      staleSource: false,
      decisions: { person: 'merged' },
      candidateTotal: 201,
      candidateOffset: 200,
      candidateLimit: 50,
      candidatesTruncated: true,
      candidates: [candidate],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  client.setConfig({ baseUrl: '/contacts-api', fetch: globalThis.fetch });
});

function intercept(responses: object[]) {
  const requests: Request[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    const body = responses.shift();
    if (!body) throw new Error('Unexpected request');
    return Response.json(body);
  });
  client.setConfig({ baseUrl: 'http://contacts.test/contacts-api', fetch: fetcher });
  return requests;
}

describe('generated contacts API bindings', () => {
  it('preserves server classifications, proofs and raw selector evidence', () => {
    const result = mapReview(review);
    expect(result.counts).toEqual(review.counts);
    expect(result.items[0]).toMatchObject({
      id: 'row-51',
      proposalRevision: 'row-proof',
      status: 'classifications.review',
      initialChoices: {},
      candidateTotal: 201,
    });
    expect(result.items[0]?.candidates[0]).toMatchObject({
      id: 'person',
      name: 'Effective historical name',
      localName: 'Raw local name',
      sourceOptions: [{ id: 'record', name: 'Current source name' }],
      points: [{ id: 'point', value: 'Original@Example.test', persisted: true }],
    });
  });

  it('uses the global proof for evidence paging and one atomic row-proof save', async () => {
    const requests = intercept([review, { batchId: 'batch' }]);
    await reviewGateway.load('batch', {
      candidateRowId: 'row-51',
      candidateOffset: 200,
      proposalRevision: 'global-proof',
    });
    await reviewGateway.save({
      batchId: 'batch',
      batchRevision: 4,
      directoryRevision: 9,
      rowId: 'row-51',
      proposalRevision: 'row-proof',
      idempotencyKey: 'retry-key',
      mergeEntityIds: ['person'],
      differentEntityIds: ['different'],
      laterEntityIds: ['later'],
      choices: {
        candidates: {},
        nameSourceRecordId: 'record',
        profileEntityId: 'person',
        preferredPointIds: ['point'],
      },
    });
    expect(new URL(requests[0]!.url).searchParams.get('proposalRevision')).toBe('global-proof');
    expect(new URL(requests[0]!.url).searchParams.get('candidateOffset')).toBe('200');
    expect(requests.map((request) => request.method)).toEqual(['GET', 'POST']);
    expect(await requests[1]!.json()).toEqual({
      batchRevision: 4,
      directoryRevision: 9,
      rowId: 'row-51',
      proposalRevision: 'row-proof',
      idempotencyKey: 'retry-key',
      mergeEntityIds: ['person'],
      differentEntityIds: ['different'],
      laterEntityIds: ['later'],
      selections: [
        { kind: 'sourceRecord', field: 'name', sourceRecordId: 'record' },
        { kind: 'entity', field: 'personProfile', entityId: 'person' },
      ],
      preferredPointIds: ['point'],
    });
  });

  it('uploads original bytes with an explicit country and loads the real staged preview', async () => {
    const requests = intercept([{ data: { id: 'account' } }, { id: 'batch' }, review]);
    const content = 'BEGIN:VCARD\nVERSION:3.0\nFN:Example Person\nEND:VCARD';
    const file = new File([content], 'contacts.vcf');
    await fileImportGateway.stage({
      file,
      format: 'vcard',
      encoding: 'utf8',
      sourceName: ' Address book ',
      collectionKey: ' contacts ',
      phoneCountryCode: 'BR',
    });
    expect(requests).toHaveLength(3);
    expect(await requests[0]!.json()).toEqual({
      provider: 'vcard',
      accountKey: 'Address book',
      label: 'Address book',
    });
    expect(requests[1]!.headers.get('content-type')).toBe('application/octet-stream');
    expect(new URL(requests[1]!.url).searchParams.get('phoneCountryCode')).toBe('BR');
    expect(await requests[1]!.text()).toBe(content);
    expect(new URL(requests[2]!.url).pathname).toBe('/contacts-api/imports/batch/review-proposals');
  });
});
