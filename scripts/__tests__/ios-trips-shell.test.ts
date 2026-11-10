import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';

import { generateTripsIcons, tripsIconFiles } from '../ios-trips-icon.mjs';

const appSchema = z.object({
  sources: z.array(z.object({ path: z.string(), excludes: z.array(z.string()).optional() })),
  settings: z.object({ base: z.record(z.string(), z.unknown()) }),
});

const projectSchema = z.object({
  targets: z.object({
    Pops: appSchema,
    PopsTrips: appSchema,
    PopsTests: z.object({
      dependencies: z.array(
        z.object({ target: z.string().optional(), link: z.boolean().optional() })
      ),
    }),
  }),
});

describe('standalone Trips app', () => {
  const { targets } = projectSchema.parse(
    parse(readFileSync(resolve('clients/ios/project.yml'), 'utf8'), { merge: true })
  );

  it('builds Trips in the ordinary native quality lane with one app entry point', () => {
    expect(targets.PopsTests.dependencies).toContainEqual({ target: 'PopsTrips', link: false });
    expect(targets.PopsTests.dependencies.find((dependency) => dependency.target)?.target).toBe(
      'Pops'
    );
    const shared = targets.PopsTrips.sources.find((source) => source.path === 'App');
    expect(shared?.excludes).toEqual(expect.arrayContaining(['PopsApp.swift', 'TripsApp.swift']));
    expect(targets.PopsTrips.sources.some((source) => source.path === 'App/TripsApp.swift')).toBe(
      true
    );
    expect(targets.PopsTrips.sources.some((source) => source.path === 'App/PopsApp.swift')).toBe(
      false
    );
    expect(targets.Pops.sources.some((source) => source.path === 'App/PopsApp.swift')).toBe(true);
  });

  it('has an independent identity, icon, and plist without claiming the Pops URL scheme', () => {
    const trips = targets.PopsTrips.settings.base;
    expect(trips.PRODUCT_BUNDLE_IDENTIFIER).toBe(
      'com.knoxiolabs.pops.trips$(POPS_BUNDLE_ID_SUFFIX_$(POPS_FLAVOR))'
    );
    expect(trips.PRODUCT_BUNDLE_IDENTIFIER).not.toBe(
      targets.Pops.settings.base.PRODUCT_BUNDLE_IDENTIFIER
    );
    expect(trips.ASSETCATALOG_COMPILER_APPICON_NAME).toBe(
      'TripsIcon$(POPS_APPICON_SUFFIX_$(POPS_FLAVOR))'
    );
    expect(trips.POPS_INFO_PLIST).toBe('App/Trips-Info.plist');
    const plist = readFileSync(resolve('clients/ios/App/Trips-Info.plist'), 'utf8');
    expect(plist).toContain('$(POPS_BFM_BASE_URL)');
    expect(plist).not.toContain('CFBundleURLTypes');
    expect(plist).not.toContain('UIBackgroundModes');
  });

  it('keeps both icon variants reproducible and marks only local builds', () => {
    expect(() => generateTripsIcons(true)).not.toThrow();
    expect(tripsIconFiles(false).has('Assets/local-badge.png')).toBe(false);
    expect(tripsIconFiles(true).has('Assets/local-badge.png')).toBe(true);
    for (const local of [false, true]) {
      const files = tripsIconFiles(local);
      expect(files.get('icon.json')).toContain('plane.svg');
      expect(files.get('Assets/plane.svg')).toContain('viewBox="0 0 1024 1024"');
    }
  });
});
