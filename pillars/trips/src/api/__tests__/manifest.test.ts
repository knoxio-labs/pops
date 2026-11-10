import { describe, expect, it } from 'vitest';

import { validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { TRIPS_NAV } from '../../contract/nav.js';
import { TRIPS_PAGES } from '../../contract/pages.js';
import { buildTripsManifest } from '../manifest.js';

describe('Trips manifest', () => {
  it('returns independently mutable operation lists on each discovery read', () => {
    const expected = buildTripsManifest('test');
    const changed = buildTripsManifest('test');
    changed.routes.queries.splice(0);
    changed.routes.mutations.splice(0);
    expect(buildTripsManifest('test')).toEqual(expected);
  });

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

  it('publishes exactly the implemented source-backed routes', () => {
    const manifest = buildTripsManifest('1.2.3');
    expect(manifest.pages).toEqual([
      { path: '', index: true, bundleSlot: 'trips-home' },
      { path: ':tripId/visits/:visitId', bundleSlot: 'trips-visit' },
      { path: ':tripId/calendar', bundleSlot: 'trips-calendar' },
      { path: ':tripId/stays/:stayId', bundleSlot: 'trips-stay' },
      { path: ':tripId/events/:eventId', bundleSlot: 'trips-event' },
      { path: ':tripId/decisions/:decisionId', bundleSlot: 'trips-decision' },
      { path: ':tripId/journeys/:journeyId', bundleSlot: 'trips-journey' },
      { path: ':tripId/documents', bundleSlot: 'trips-documents' },
      { path: ':tripId/capture', bundleSlot: 'trips-capture' },
      { path: ':tripId/inbox', bundleSlot: 'trips-inbox' },
      { path: ':tripId/explore', bundleSlot: 'trips-explore' },
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
    expect(manifest.routes.queries).toHaveLength(29);
    expect(manifest.routes.queries).toEqual(
      expect.arrayContaining([
        'trips.rentals.list',
        'trips.rentals.get',
        'trips.responsibilities.list',
        'trips.responsibilities.get',
      ])
    );
    expect(manifest.routes.mutations).toEqual(
      expect.arrayContaining([
        'trips.rentals.create',
        'trips.rentals.update',
        'trips.rentals.delete',
        'trips.responsibilities.replace',
      ])
    );
    expect(manifest.routes.queries).toContain('trips.documentAssociations.list');
    expect(manifest.routes.mutations).toEqual(
      expect.arrayContaining([
        'trips.documentAssociations.create',
        'trips.documentAssociations.delete',
      ])
    );
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
        'trips.events.create',
        'trips.events.update',
        'trips.events.delete',
        'trips.stays.update',
        'trips.stays.delete',
        'trips.journeyLegs.remove',
        'trips.journeyLegs.restore',
        'trips.journeyGroups.create',
        'trips.journeyGroups.addBlank',
        'trips.journeyGroups.select',
        'trips.journeyGroups.delete',
      ])
    );
    expect(manifest.routes.queries).toContain('trips.journeys.timing');
    expect(manifest.routes.queries).toContain('trips.journeys.workspace');
    expect(manifest.routes.queries).toEqual(
      expect.arrayContaining([
        'trips.events.list',
        'trips.events.get',
        'trips.stays.list',
        'trips.stays.get',
        'trips.decisions.list',
        'trips.decisions.get',
        'trips.decisions.workspace',
        'trips.decisionOptions.list',
        'trips.decisionOptions.get',
      ])
    );
    expect(manifest.uri.types).toEqual([]);
  });
});
