import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { TRIPS_NAV } from '../../contract/nav.js';
import { TRIPS_PAGES } from '../../contract/pages.js';
import { buildTripsManifest } from '../manifest.js';

describe('Trips manifest', () => {
  it('publishes the approved rail entry without adding unimplemented navigation', () => {
    const manifest = buildTripsManifest('1.2.3');
    expect(manifest.nav).toEqual({
      id: 'trips',
      label: 'Trips',
      labelKey: 'trips',
      icon: 'plane',
      basePath: '/trips',
      order: 90,
      items: [{ path: '', label: 'Home', labelKey: 'trips.home', icon: 'layout-dashboard' }],
    });
    expect(manifest.nav).toEqual(TRIPS_NAV);
    expect(manifest.nav).not.toHaveProperty('color');
  });

  it('publishes exactly the implemented home, stay, and settings routes', () => {
    const manifest = buildTripsManifest('1.2.3');
    expect(manifest.pages).toEqual([
      { path: '', index: true, bundleSlot: 'trips-home' },
      { path: ':tripId/stays/:stayId', bundleSlot: 'trips-stay' },
      { path: ':tripId/settings', bundleSlot: 'trips-settings' },
    ]);
    expect(manifest.pages).toEqual(TRIPS_PAGES);
    expect(manifest.assetsBaseUrl).toBe('/trips-ui/trips.js');
    expect(manifest.stylesheetUrl).toBe('/trips-ui/trips.css');
  });

  it('passes registry validation and declares all source and order operations', () => {
    const manifest = buildTripsManifest('1.2.3');
    expect(validateManifestPayload(manifest).ok).toBe(true);
    expect(manifest.contract).toEqual({
      package: '@pops/trips',
      version: '1.2.3',
      tag: 'contract-trips@v1.2.3',
    });
    expect(manifest.routes.queries).toHaveLength(19);
    expect(manifest.routes.mutations).toContain('trips.visits.reorder');
    expect(manifest.routes.mutations).toEqual(
      expect.arrayContaining([
        'trips.decisions.create',
        'trips.decisions.update',
        'trips.decisions.select',
        'trips.decisions.delete',
        'trips.decisionOptions.create',
        'trips.decisionOptions.update',
        'trips.decisionOptions.delete',
        'trips.decisionOptions.restore',
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
      expect.arrayContaining([
        'trips.stays.list',
        'trips.stays.get',
        'trips.decisions.list',
        'trips.decisions.get',
        'trips.decisionOptions.list',
        'trips.decisionOptions.get',
      ])
    );
    expect(manifest.uri.types).toEqual([]);
  });
});
