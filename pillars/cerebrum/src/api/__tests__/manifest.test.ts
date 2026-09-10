/**
 * Manifest contract test — confirms the cerebrum pillar manifest payload
 * validates against `ManifestPayloadSchema` and surfaces the cerebrum + ego
 * settings contributions. The `nav`/`pages` UI dimensions are deferred to the
 * FE-rewire slice (Phase D), so they are intentionally absent here.
 */
import { describe, expect, it } from 'vitest';

import { ManifestPayloadSchema, validateManifestPayload } from '@pops/pillar-sdk/manifest-schema';

import { CEREBRUM_CAPTURE_SLOT, CEREBRUM_PAGES } from '../../contract/pages.js';
import { cerebrumManifest, egoManifest } from '../../contract/settings/index.js';
import { buildCerebrumCapabilityReporter, buildCerebrumManifest } from '../manifest.js';

describe('buildCerebrumManifest', () => {
  it('produces a payload that validates against ManifestPayloadSchema', () => {
    const payload = buildCerebrumManifest('1.2.3');
    const result = ManifestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('declares the cerebrum + ego settings manifests under settings.manifests', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.settings).toEqual({ manifests: [cerebrumManifest, egoManifest] });
  });

  it('threads the version through the contract block', () => {
    const payload = buildCerebrumManifest('4.5.6');
    expect(payload.contract).toEqual({
      package: '@pops/cerebrum',
      version: '4.5.6',
      tag: 'contract-cerebrum@v4.5.6',
    });
  });

  /**
   * The FE rewire this test was waiting for is POPS-3225. The shell no longer
   * compiles `@pops/app-cerebrum` in, so the rail entry and every route come
   * off this wire.
   */
  it('declares the nav and every page the app mounts', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.nav?.id).toBe('cerebrum');
    expect(payload.pages).toHaveLength(CEREBRUM_PAGES.length);
    expect(payload.pages?.map((page) => page.bundleSlot)).toEqual(
      CEREBRUM_PAGES.map((page) => page.bundleSlot)
    );
  });

  /**
   * The overlay is not a page, and nothing routes to it — so if it were left
   * off the wire the only symptom would be the global capture hotkey opening
   * an empty modal. It travels here because the shell resolves a
   * loader-mounted pillar's overlay from the manifest plus the remote bundle
   * (POPS-3266), not from its compiled bundle map.
   */
  it('declares the capture overlay, which no route would reveal', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.captureOverlay?.bundleSlot).toBe(CEREBRUM_CAPTURE_SLOT);
    expect(payload.captureOverlay?.hotkey).toBe('mod+shift+k');
    expect(payload.pages?.map((page) => page.bundleSlot)).not.toContain(CEREBRUM_CAPTURE_SLOT);
  });

  /**
   * Declaring it is what moves the pillar onto the runtime loader: the shell
   * imports the bundle from this URL instead of compiling the app into its
   * own build. Root-relative, because one deployment answers to a LAN name, a
   * Tailscale name and `localhost`, and no absolute origin is right on all
   * three.
   */
  it('declares a root-relative assetsBaseUrl', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.assetsBaseUrl).toBe('/cerebrum-ui/cerebrum.js');
  });

  it('declares cerebrum.vectorSearch as a capability feature (epic 05 / S0)', () => {
    const payload = buildCerebrumManifest('1.2.3');
    expect(payload.features).toEqual([
      {
        key: 'cerebrum.vectorSearch',
        label: 'Vector search (sqlite-vec)',
        description:
          'Semantic and hybrid retrieval. Disabled when the sqlite-vec extension fails to load at startup.',
        default: true,
        scope: 'capability',
        capability: { pillar: 'cerebrum', key: 'vectorSearch' },
      },
    ]);
  });

  it('passes wire-shaped validation', () => {
    const payload = buildCerebrumManifest('1.2.3');
    const result = validateManifestPayload(payload);
    expect(result.ok).toBe(true);
  });
});

describe('buildCerebrumCapabilityReporter (P2 settings federation)', () => {
  it('reports settings: true so the shell routes settings to cerebrum', () => {
    expect(buildCerebrumCapabilityReporter(true)()['settings']).toBe(true);
  });

  it('preserves the live vectorSearch status alongside settings', () => {
    expect(buildCerebrumCapabilityReporter(true)()).toEqual({
      vectorSearch: true,
      settings: true,
    });
    expect(buildCerebrumCapabilityReporter(false)()).toEqual({
      vectorSearch: false,
      settings: true,
    });
  });
});
