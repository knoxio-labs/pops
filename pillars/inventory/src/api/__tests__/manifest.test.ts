/**
 * Manifest contract test — confirms the inventory pillar manifest
 * payload validates against `ManifestPayloadSchema` and surfaces the
 * `inventoryManifest` settings contribution (ADR-037) plus the `nav` and
 * `pages` UI dimensions the shell's registry walk mounts
 * (`pillars/shell/src/app/installed-modules.ts`).
 */
import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { inventoryManifest } from '../../contract/settings/index.js';
import { buildInventoryCapabilityReporter, buildInventoryManifest } from '../manifest.js';

describe('buildInventoryManifest', () => {
  it('produces a payload that validates against ManifestPayloadSchema', () => {
    const payload = buildInventoryManifest('1.2.3');
    const result = ManifestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('declares the inventory settings manifest under settings.manifests', () => {
    const payload = buildInventoryManifest('1.2.3');
    expect(payload.settings).toEqual({ manifests: [inventoryManifest] });
  });

  it('threads the version through the contract block', () => {
    const payload = buildInventoryManifest('4.5.6');
    expect(payload.contract).toEqual({
      package: '@pops/inventory',
      version: '4.5.6',
      tag: 'contract-inventory@v4.5.6',
    });
  });

  describe('nav + pages UI dimensions', () => {
    it('declares the inventory nav descriptor with id, basePath, order, and items', () => {
      const payload = buildInventoryManifest('1.2.3');
      expect(payload.nav).toMatchObject({
        id: 'inventory',
        label: 'Inventory',
        labelKey: 'inventory',
        icon: 'package',
        color: 'amber',
        basePath: '/inventory',
        order: 30,
      });
      expect(payload.nav?.items).toEqual([
        { path: '', label: 'Overview', labelKey: 'inventory.overview', icon: 'layout-dashboard' },
        { path: '/items', label: 'Items', labelKey: 'inventory.items', icon: 'package' },
        {
          path: '/containers',
          label: 'Containers',
          labelKey: 'inventory.containers',
          icon: 'box',
        },
        {
          path: '/locations',
          label: 'Locations',
          labelKey: 'inventory.locations',
          icon: 'map-pin',
        },
        { path: '/in-hand', label: 'In hand', labelKey: 'inventory.inHand', icon: 'hand' },
        {
          path: '/connections',
          label: 'Connections',
          labelKey: 'inventory.connections',
          icon: 'cable',
        },
        { path: '/types', label: 'Types', labelKey: 'inventory.types', icon: 'shapes' },
        { path: '/reports', label: 'Reports', labelKey: 'inventory.reports', icon: 'bar-chart-3' },
        { path: '/sync', label: 'Sync', labelKey: 'inventory.sync', icon: 'refresh-cw' },
      ]);
    });

    it('declares pages covering every inventory route surface', () => {
      const payload = buildInventoryManifest('1.2.3');
      expect(payload.pages).toEqual([
        { path: '', index: true, bundleSlot: 'inventory-overview' },
        { path: 'items', bundleSlot: 'inventory-items' },
        { path: 'items/new', bundleSlot: 'inventory-item-form' },
        { path: 'items/bulk-new', bundleSlot: 'inventory-bulk-entry' },
        { path: 'items/:id', bundleSlot: 'inventory-item-detail' },
        { path: 'items/:id/edit', bundleSlot: 'inventory-item-form' },
        { path: 'items/:id/history', bundleSlot: 'inventory-item-history' },
        { path: 'containers', bundleSlot: 'inventory-containers' },
        { path: 'moving-day', bundleSlot: 'inventory-moving-day' },
        { path: 'in-hand', bundleSlot: 'inventory-in-hand' },
        { path: 'locations', bundleSlot: 'inventory-location-tree' },
        { path: 'locations/:id', bundleSlot: 'inventory-location' },
        { path: 'search', bundleSlot: 'inventory-search' },
        { path: 'connections', bundleSlot: 'inventory-connections' },
        { path: 'connections/fixtures', bundleSlot: 'inventory-fixtures' },
        { path: 'fixtures/:id', bundleSlot: 'inventory-fixture' },
        { path: 'types', bundleSlot: 'inventory-type-catalogue' },
        { path: 'types/:id/arrived', bundleSlot: 'inventory-type-arrived' },
        { path: 'reports', bundleSlot: 'inventory-reports' },
        { path: 'labels', bundleSlot: 'inventory-labels' },
        { path: 'sync', bundleSlot: 'inventory-sync' },
        { path: 'import', bundleSlot: 'inventory-import' },
        { path: 'warranties', bundleSlot: 'inventory-warranties-redirect' },
        { path: 'activity', bundleSlot: 'inventory-activity-redirect' },
        { path: 'reports/insurance', bundleSlot: 'inventory-insurance-report-redirect' },
        { path: 'report', bundleSlot: 'inventory-report-redirect' },
        { path: 'report/insurance', bundleSlot: 'inventory-insurance-report-redirect' },
      ]);
    });

    /**
     * Declaring it is what moves the pillar onto the runtime loader: the shell
     * imports the bundle from this URL instead of compiling
     * `@pops/app-inventory` into its own build (POPS-3223). Root-relative,
     * because one deployment answers to a LAN name, a Tailscale name and
     * `localhost`, and no absolute origin is right on all three.
     */
    it('declares a root-relative assetsBaseUrl', () => {
      const payload = buildInventoryManifest('1.2.3');
      expect(payload.assetsBaseUrl).toBe('/inventory-ui/inventory.js');
      expect(payload.stylesheetUrl).toBe('/inventory-ui/inventory.css');
    });

    it('passes wire-shaped validation with the new UI dimensions populated', () => {
      const payload = buildInventoryManifest('1.2.3');
      const result = validateManifestPayload(payload);
      expect(result.ok).toBe(true);
    });
  });
});

describe('buildInventoryCapabilityReporter', () => {
  it('reports settings: true so the shell routes settings to inventory', () => {
    expect(buildInventoryCapabilityReporter()()).toEqual({ settings: true });
  });
});
