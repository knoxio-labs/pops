import { describe, expect, it, vi } from 'vitest';

import { ErrorBodySchema } from '@pops/types';

import { createOrchestratorApp } from '../app.js';
import { createTestTransport } from './test-http.js';

import type { TagFederationRequest, TagFederationResponse } from '../tags/federation.js';

const { requestOn } = createTestTransport();

const federatedResult: TagFederationResponse = {
  expandedTagIds: ['trip-id', 'trip-child-id'],
  sections: [
    {
      pillarId: 'finance',
      items: [
        {
          uri: 'pops:finance/transaction/tx-1',
          entityType: 'transaction',
          title: 'Brazil trip flight',
          tagIds: ['trip-id'],
          date: '2026-10-03',
          amountCents: -34000,
        },
      ],
      nextCursor: null,
    },
  ],
  pillars: [
    { pillarId: 'finance', status: 'ok' },
    { pillarId: 'purchases', status: 'unavailable' },
  ],
};

function appFor(
  taggedQuerySource: (request: TagFederationRequest) => Promise<TagFederationResponse>
) {
  return createOrchestratorApp(
    { version: '1.2.3', selfBaseUrl: 'http://localhost:3009' },
    { taggedQuerySource }
  );
}

describe('orchestrator shared-tag query', () => {
  it('returns expanded ids, carrier sections, and each carrier status', async () => {
    const taggedQuerySource = vi.fn(async () => federatedResult);
    const response = await requestOn(appFor(taggedQuerySource))
      .post('/tagged/query')
      .send({ tagIds: ['trip-id'], limit: 25 })
      .expect(200);

    expect(response.body).toEqual({
      expandedTagIds: ['trip-id', 'trip-child-id'],
      sections: [
        {
          pillar: 'finance',
          items: federatedResult.sections[0]?.items,
          nextCursor: null,
        },
      ],
      pillars: [
        { id: 'finance', status: 'ok' },
        { id: 'purchases', status: 'unavailable' },
      ],
    });
    expect(taggedQuerySource).toHaveBeenCalledWith({ tagIds: ['trip-id'], limit: 25 });
  });

  it('returns an error envelope for an empty tag id list without querying carriers', async () => {
    const taggedQuerySource = vi.fn(async () => federatedResult);
    const response = await requestOn(appFor(taggedQuerySource))
      .post('/tagged/query')
      .send({ tagIds: [] })
      .expect(400);

    expect(ErrorBodySchema.safeParse(response.body).success).toBe(true);
    expect(taggedQuerySource).not.toHaveBeenCalled();
  });

  it('returns an error envelope for more than 500 ids without querying carriers', async () => {
    const taggedQuerySource = vi.fn(async () => federatedResult);
    const tagIds = Array.from({ length: 501 }, (_, index) => `tag-${index}`);
    const response = await requestOn(appFor(taggedQuerySource))
      .post('/tagged/query')
      .send({ tagIds })
      .expect(400);

    expect(ErrorBodySchema.safeParse(response.body).success).toBe(true);
    expect(taggedQuerySource).not.toHaveBeenCalled();
  });

  it('maps tag expansion failures to the registered service-unavailable error', async () => {
    const taggedQuerySource = vi.fn(async () => {
      throw new Error('downstream details must not be exposed');
    });
    const response = await requestOn(appFor(taggedQuerySource))
      .post('/tagged/query')
      .send({ tagIds: ['trip-id'] })
      .expect(503);

    expect(ErrorBodySchema.safeParse(response.body).success).toBe(true);
    expect(response.body.code).toBe('orchestrator.tagged.unavailable');
    expect(JSON.stringify(response.body)).not.toContain('downstream details');
  });

  it('serves the committed contract with operation id tagged.query', async () => {
    const response = await requestOn(appFor(async () => federatedResult))
      .get('/openapi')
      .expect(200);

    expect(response.body.paths['/tagged/query'].post.operationId).toBe('tagged.query');
    expect(
      response.body.paths['/tagged/query'].post.requestBody.content['application/json'].schema
        .required
    ).toEqual(['tagIds']);
  });
});
