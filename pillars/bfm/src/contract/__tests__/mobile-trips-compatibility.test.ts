import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildPillarOpenApiDocument } from '@pops/contract-openapi';

import { mobileTripsContract } from '../rest-mobile-trips.js';
import { bfmContract } from '../rest.js';

const legacyResponses: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/mobile-trips-legacy-responses.json', import.meta.url), 'utf8')
);

describe('installed mobile Trips read compatibility', () => {
  it('preserves every legacy detail response schema from the published installed-client baseline', () => {
    const projection = buildPillarOpenApiDocument({
      contract: bfmContract,
      packageDir: fileURLToPath(new URL('../../../', import.meta.url)),
      pillarId: 'bfm',
      description: 'Contract compatibility test',
      hoistRecursiveDefinitions: false,
    });
    const document = z
      .object({
        paths: z.object({
          '/mobile/trips/{id}': z.object({ get: z.object({ responses: z.unknown() }) }),
        }),
      })
      .parse(projection);
    expect(document.paths['/mobile/trips/{id}'].get.responses).toEqual(legacyResponses);
  });

  it('requires the same read capability through an explicit versioned operation', () => {
    expect(mobileTripsContract.getTripV2.path).toBe('/mobile/v2/trips/:id');
    expect(mobileTripsContract.getTripV2.metadata).toEqual(mobileTripsContract.getTrip.metadata);
    expect(mobileTripsContract.getTripV2.metadata).toEqual({ capability: 'trips.read' });
  });
});
