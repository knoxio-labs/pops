import { describe, expect, it } from 'vitest';

import { sourceStay } from '../stay/test-utils';
import { createClient } from '../trips-api/client';
import { createGapStay } from './api';

const valid = sourceStay();
describe('canonical accommodation creation proof', () => {
  it.each([
    { ...valid, tripId: 8 },
    { ...valid, visitId: 32 },
    { ...valid, visitId: null },
    { ...valid, id: 0 },
    { ...valid, id: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, id: 2.5 },
    { ...valid, status: 'Booked' },
    { ...valid, timing: { arrival: 'yesterday' } },
    { ...valid, extra: true },
    { ...valid, timing: { extra: true } },
    {},
    null,
  ])(
    'rejects noncanonical/foreign 201 receipt %# without manufacturing an identity',
    async (body) => {
      const client = createClient({
        baseUrl: 'http://create.test',
        fetch: async () =>
          new Response(JSON.stringify(body), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
      });
      await expect(
        createGapStay({ tripId: 7, client }, 31, '2029-05-01', '2029-05-09')
      ).rejects.toBeDefined();
    }
  );
});
