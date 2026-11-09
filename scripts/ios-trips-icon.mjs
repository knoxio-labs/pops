#!/usr/bin/env node
/** Generates the standalone Trips Icon Composer bundles using the shared Pops icon treatment. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANVAS, PALETTE, iconGroup, iconManifest } from './ios-app-icon.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Plane artwork with room for the system-rendered icon corners and material. */
export function tripsPlaneSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PALETTE.sky}"/>
      <stop offset="1" stop-color="${PALETTE.indigo}"/>
    </linearGradient>
  </defs>
  <path fill="url(#body)" d="M512 130 574 390 840 565V622L568 535 560 750 648 812V852L512 810 376 852V812L464 750 456 535 184 622V565L450 390Z"/>
</svg>
`;
}

/**
 * Icon contents for the shipped and local Trips variants; local builds carry the existing badge.
 * @param {boolean} local
 * @returns {Map<string, string | Buffer>}
 */
export function tripsIconFiles(local = false) {
  const plane = iconGroup('Trips', 'plane.svg', 0);
  const groups = local
    ? [{ ...iconGroup('Local badge', 'local-badge.png', 0), specular: true }, plane]
    : [plane];
  const manifest = { ...iconManifest(), groups };
  /** @type {Map<string, string | Buffer>} */
  const files = new Map([
    ['Assets/plane.svg', tripsPlaneSvg()],
    ['icon.json', `${JSON.stringify(manifest, null, 2)}\n`],
  ]);
  if (local) {
    files.set(
      'Assets/local-badge.png',
      readFileSync(join(repoRoot, 'clients/ios/App/AppIconLocal.icon/Assets/local-badge.png'))
    );
  }
  return files;
}

/**
 * Writes both Trips icons, or checks that every generated asset is current.
 * @param {boolean} check
 */
export function generateTripsIcons(check = false) {
  for (const local of [false, true]) {
    const bundle = join(repoRoot, `clients/ios/App/TripsIcon${local ? 'Local' : ''}.icon`);
    for (const [relative, contents] of tripsIconFiles(local)) {
      const path = join(bundle, relative);
      if (check) {
        if (!readFileSync(path).equals(Buffer.from(contents))) {
          throw new Error(`Trips icon drift: ${relative}`);
        }
      } else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, contents);
      }
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check')) {
    throw new Error('usage: node scripts/ios-trips-icon.mjs [--check]');
  }
  generateTripsIcons(args.includes('--check'));
}
