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
      expect(payload.nav?.items.map((item) => item.path)).toEqual([
        '',
        '/warranties',
        '/locations',
        '/reports',
        '/connections',
      ]);
    });

    it('declares pages covering every inventory route surface', () => {
      const payload = buildInventoryManifest('1.2.3');
      expect(payload.pages).toEqual([
        { path: '', index: true, bundleSlot: 'inventory-items' },
        { path: 'items/new', bundleSlot: 'inventory-item-form' },
        { path: 'items/:id', bundleSlot: 'inventory-item-detail' },
        { path: 'items/:id/edit', bundleSlot: 'inventory-item-form' },
        { path: 'connections', bundleSlot: 'inventory-connections' },
        { path: 'warranties', bundleSlot: 'inventory-warranties' },
        { path: 'locations', bundleSlot: 'inventory-location-tree' },
        {
          path: 'reports',
          bundleSlot: 'inventory-reports-group',
          children: [
            { path: '', index: true, bundleSlot: 'inventory-report-dashboard' },
            { path: 'insurance', bundleSlot: 'inventory-insurance-report' },
          ],
        },
        { path: 'report', bundleSlot: 'inventory-report-redirect' },
        { path: 'report/insurance', bundleSlot: 'inventory-insurance-report-redirect' },
      ]);
    });

    /**
     * Both were absent from the list above until POPS-3223. Harmless while the
     * bundle map mounted the whole route table; a 404 on an old bookmark the
     * moment the pillar mounted from `pages` alone. Named separately from the
     * `toEqual` so the reason survives a future reshuffle of that list.
     */
    it('declares the legacy report redirects, which the route table still mounts', () => {
      const payload = buildInventoryManifest('1.2.3');
      const paths = payload.pages?.map((page) => page.path) ?? [];
      expect(paths).toContain('report');
      expect(paths).toContain('report/insurance');
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
