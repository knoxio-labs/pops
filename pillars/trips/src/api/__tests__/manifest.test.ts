import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { buildTripsManifest } from '../manifest.js';

describe('Trips manifest', () => {
  it('passes registry validation and declares all source and order operations', () => {
    const manifest = buildTripsManifest('1.2.3');
    expect(validateManifestPayload(manifest).ok).toBe(true);
    expect(manifest.contract).toEqual({
      package: '@pops/trips',
      version: '1.2.3',
      tag: 'contract-trips@v1.2.3',
    });
    expect(manifest.routes.queries).toHaveLength(15);
    expect(manifest.routes.mutations).toContain('trips.visits.reorder');
    expect(manifest.routes.mutations).toEqual(
      expect.arrayContaining([
        'trips.stays.create',
        'trips.stays.update',
        'trips.stays.delete',
        'trips.journeyGroups.create',
        'trips.journeyGroups.addBlank',
        'trips.journeyGroups.select',
        'trips.journeyGroups.delete',
      ])
    );
    expect(manifest.routes.queries).toContain('trips.journeys.timing');
    expect(manifest.routes.queries).toEqual(
      expect.arrayContaining(['trips.stays.list', 'trips.stays.get'])
    );
    expect(manifest.uri.types).toEqual([]);
  });
});
