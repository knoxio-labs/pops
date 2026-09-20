import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NAV_COLOR } from '@pops/pillar-sdk/manifest-schema';

import {
  BUNDLES,
  CANVAS,
  CONTACT_SHADOW_REACH,
  CORD_CENTRES,
  CORD_GAP,
  CORD_WIDTH,
  CROSSING_CLEARANCE,
  GLOSS,
  LAYER_FILES,
  MARK_SPAN,
  PALETTE,
  SHADOW_OPACITY,
  UPPER_TRANSLUCENCY,
  WARP,
  WEFT,
  bundleFiles,
  contactShadowStops,
  horizontalIsOver,
  iconManifest,
  layerSvg,
} from '../ios-app-icon.mjs';

const ROWS = [0, 1, 2];
const COLS = [0, 1, 2];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

type Rect = { x: number; y: number; width: number; height: number; rx: number; fill: string };

/** Every `<rect>` in a generated layer, in document order. */
function rects(svg: string): Rect[] {
  return [...svg.matchAll(/<rect ([^/]*)\/>/g)]
    .filter((match) => /fill="url\(#warp-\d\)"/.test(match[0]))
    .map((match) => {
      const body = match[1] ?? '';
      const attrs = new Map(
        [...body.matchAll(/([a-z]+)="([^"]*)"/g)].map((a) => [a[1] ?? '', a[2] ?? ''] as const)
      );
      const number = (key: string): number => {
        const raw = attrs.get(key);
        if (raw === undefined) throw new Error(`<rect> has no ${key}: ${match[0]}`);
        return Number(raw);
      };
      const fill = attrs.get('fill');
      if (fill === undefined) throw new Error(`<rect> has no fill: ${match[0]}`);
      return {
        x: number('x'),
        y: number('y'),
        width: number('width'),
        height: number('height'),
        rx: number('rx'),
        fill,
      };
    });
}

type WeftPath = { fill: string; rule: string; holes: { x0: number; x1: number }[] };

/** Every `<path>` in the weft layer, with the holes its even-odd subpaths cut. */
function weftPaths(svg: string): WeftPath[] {
  return [...svg.matchAll(/<path ([^/]*)\/>/g)]
    .filter((match) => /fill="url\(#weft-\d\)"/.test(match[0]))
    .map((match) => {
      const body = match[1] ?? '';
      const rule = /fill-rule="([^"]*)"/.exec(body)?.[1] ?? '';
      const fill = /[^-]fill="([^"]*)"/.exec(` ${body}`)?.[1] ?? '';
      const d = /d="([^"]*)"/.exec(body)?.[1] ?? '';
      // The first subpath is the capsule outline; every later one is a hole.
      const subpaths = d
        .split('Z')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .slice(1);
      const holes = subpaths.map((sub) => {
        const xs = [...sub.matchAll(/[ML] (-?\d+(?:\.\d+)?) /g)].map((m) => Number(m[1]));
        return { x0: Math.min(...xs), x1: Math.max(...xs) };
      });
      return { fill, rule, holes };
    });
}

/** Every gradient in a layer, by id, as its ordered stop colours. */
function gradients(svg: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const match of svg.matchAll(
    /<linearGradient id="([^"]+)"[^>]*>([\s\S]*?)<\/linearGradient>/g
  )) {
    const id = match[1] ?? '';
    const stops = [...(match[2] ?? '').matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map(
      (stop) => stop[1] ?? ''
    );
    found.set(id, stops);
  }
  return found;
}

/** The index of the stop in {@link GLOSS} that carries the unmodified body colour. */
const BODY_STOP = GLOSS.findIndex(
  ([, lightness, saturation]) => lightness === 0 && saturation === 0
);

type Group = {
  layers: { 'image-name': string; opacity: number; position: { scale: number } }[];
  specular: boolean;
  shadow: { kind: string; opacity: number };
  translucency: { enabled: boolean; value: number };
};

function groupsOf(manifest: Record<string, unknown>): Group[] {
  const groups = manifest.groups;
  if (!Array.isArray(groups)) throw new Error('the manifest has no groups array');
  return groups as Group[];
}

function groupAt(manifest: Record<string, unknown>, index: number): Group {
  const group = groupsOf(manifest)[index];
  if (group === undefined) throw new Error(`the manifest has no group ${index}`);
  return group;
}

function imageOf(group: Group): string {
  const layer = group.layers[0];
  if (layer === undefined) throw new Error('a group has no layers');
  return layer['image-name'];
}

function paletteOf(name: string): string {
  const hex = Object.entries(PALETTE).find(([key]) => key === name)?.[1];
  if (hex === undefined) throw new Error(`${name} is not in the palette`);
  return hex;
}

function centreAt(index: number): number {
  const centre = CORD_CENTRES[index];
  if (centre === undefined) throw new Error(`no cord centre ${index}`);
  return centre;
}

describe('the palette is the nav palette', () => {
  it('carries exactly the members of NAV_COLOR', () => {
    expect(NAV_COLOR.options).toHaveLength(6);
    expect([...NAV_COLOR.options].toSorted()).toEqual(Object.keys(PALETTE).toSorted());
  });

  it('spends every colour exactly once, three per axis', () => {
    expect([...WARP, ...WEFT].toSorted()).toEqual(Object.keys(PALETTE).toSorted());
    expect(WARP).toHaveLength(3);
    expect(WEFT).toHaveLength(3);
  });
});

describe('the interlace', () => {
  it('alternates over and under across the whole lattice', () => {
    expect(ROWS.map((row) => COLS.map((col) => horizontalIsOver(row, col)))).toEqual([
      [false, true, false],
      [true, false, true],
      [false, true, false],
    ]);
  });

  it('never lets two neighbouring crossings agree', () => {
    for (const row of ROWS) {
      for (const col of COLS) {
        if (col < 2) expect(horizontalIsOver(row, col)).not.toBe(horizontalIsOver(row, col + 1));
        if (row < 2) expect(horizontalIsOver(row, col)).not.toBe(horizontalIsOver(row + 1, col));
      }
    }
  });

  it('cuts a hole in the weft at exactly the crossings the warp passes over', () => {
    const paths = weftPaths(layerSvg('weft'));
    expect(paths).toHaveLength(3);

    paths.forEach((path, row) => {
      const expected = COLS.filter((col) => !horizontalIsOver(row, col));
      expect(path.holes, `weft row ${row}`).toHaveLength(expected.length);

      const half = CORD_WIDTH / 2 + CROSSING_CLEARANCE;
      path.holes.forEach((hole, index) => {
        const col = expected[index] ?? -1;
        expect(hole.x0).toBe(centreAt(col) - half);
        expect(hole.x1).toBe(centreAt(col) + half);
      });
    });
  });

  it('cuts five holes in total, which is what a three-by-three basketweave needs', () => {
    const holes = weftPaths(layerSvg('weft')).flatMap((path) => path.holes);
    expect(holes).toHaveLength(5);
  });

  it('meets the warp exactly, without a background slit at any crossing', () => {
    expect(CROSSING_CLEARANCE).toBe(0);
    for (const hole of weftPaths(layerSvg('weft')).flatMap((path) => path.holes)) {
      expect(hole.x1 - hole.x0).toBe(CORD_WIDTH + CROSSING_CLEARANCE * 2);
    }
  });

  it('needs even-odd fill for the holes to be holes at all', () => {
    for (const path of weftPaths(layerSvg('weft'))) expect(path.rule).toBe('evenodd');
  });

  it('cuts nothing out of the warp, which is the lower group', () => {
    expect(weftPaths(layerSvg('warp'))).toHaveLength(0);
    expect(rects(layerSvg('warp'))).toHaveLength(3);
  });
});

describe('a generated layer', () => {
  it('draws three warp cords at the right centres, each filled by its own gloss', () => {
    const svg = layerSvg('warp');
    const ramps = gradients(svg);
    rects(svg).forEach((rect, index) => {
      expect(rect.width).toBe(CORD_WIDTH);
      expect(rect.height).toBe(MARK_SPAN);
      expect(rect.x + CORD_WIDTH / 2).toBe(centreAt(index));
      expect(rect.rx, 'an rx below half the thickness squares the ends off').toBe(CORD_WIDTH / 2);
      expect(rect.fill).toBe(`url(#warp-${index})`);
      // The body stop is the cord's palette colour untouched; every other stop
      // is that colour shaded, so this is what ties the gloss to the palette.
      expect(ramps.get(`warp-${index}`)?.[BODY_STOP]).toBe(paletteOf(WARP[index] ?? ''));
    });
  });

  it('spans every weft cord the full mark, each filled by its own gloss', () => {
    const svg = layerSvg('weft');
    const ramps = gradients(svg);
    weftPaths(svg).forEach((path, index) => {
      expect(path.fill).toBe(`url(#weft-${index})`);
      expect(ramps.get(`weft-${index}`)?.[BODY_STOP]).toBe(paletteOf(WEFT[index] ?? ''));
    });
    const margin = (CANVAS - MARK_SPAN) / 2;
    expect(svg).toContain(`M ${margin + CORD_WIDTH / 2} `);
  });

  it('declares a body stop at all, so the palette is reachable from the artwork', () => {
    expect(BODY_STOP).toBeGreaterThanOrEqual(0);
  });

  it('matches the reference proportions with room around the weave', () => {
    expect(MARK_SPAN / CANVAS).toBeGreaterThan(0.74);
    expect(MARK_SPAN / CANVAS).toBeLessThan(0.79);
    expect(CORD_WIDTH / MARK_SPAN).toBeGreaterThan(0.18);
    expect(CORD_WIDTH / MARK_SPAN).toBeLessThan(0.21);
  });

  it('keeps every cord inside the canvas, clear of the corner mask', () => {
    const margin = (CANVAS - MARK_SPAN) / 2;
    expect(margin).toBeGreaterThan(CORD_WIDTH / 3);

    for (const rect of rects(layerSvg('warp'))) {
      expect(rect.x).toBeGreaterThanOrEqual(margin);
      expect(rect.y).toBeGreaterThanOrEqual(margin);
      expect(rect.x + rect.width).toBeLessThanOrEqual(CANVAS - margin);
      expect(rect.y + rect.height).toBeLessThanOrEqual(CANVAS - margin);
    }

    // Only M and L carry a bare coordinate pair; an A leads with its two radii.
    const weft = layerSvg('weft');
    const coords = [...weft.matchAll(/[ML] (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)];
    expect(coords.length).toBeGreaterThan(0);
    for (const coord of coords) {
      for (const value of [Number(coord[1]), Number(coord[2])]) {
        expect(value).toBeGreaterThanOrEqual(margin);
        expect(value).toBeLessThanOrEqual(CANVAS - margin);
      }
    }

    // The caps are arcs, so the extremes are a radius beyond the last L. A
    // radius other than half the thickness would either square the cap off or
    // bulge it past the margin this test just checked.
    for (const arc of weft.matchAll(/A (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)) {
      expect(Number(arc[1])).toBe(CORD_WIDTH / 2);
      expect(Number(arc[2])).toBe(CORD_WIDTH / 2);
    }
  });

  it('leaves a background channel between parallel cords', () => {
    expect(CORD_GAP).toBeGreaterThan(CORD_WIDTH / 3);
    for (let i = 0; i + 1 < CORD_CENTRES.length; i += 1) {
      expect(centreAt(i + 1) - centreAt(i)).toBe(CORD_WIDTH + CORD_GAP);
    }
  });

  it('is square and unmasked, so the system can do the masking', () => {
    for (const which of ['warp', 'weft'] as const) {
      const svg = layerSvg(which);
      expect(svg).toContain(`viewBox="0 0 ${CANVAS} ${CANVAS}"`);
      expect(svg).toContain(`width="${CANVAS}"`);
      expect(svg).toContain(`height="${CANVAS}"`);
      expect(svg).not.toMatch(/<(clipPath|mask)\b/);
      expect(svg).not.toMatch(/\b(clip-path|mask)=/);
    }
  });
});

describe('the gloss profile', () => {
  const lightness = GLOSS.map(([, delta]) => delta);
  const saturation = GLOSS.map(([, , delta]) => delta);

  it('runs from one edge to the other, in order', () => {
    const offsets = GLOSS.map(([offset]) => offset);
    expect(offsets.at(0)).toBe(0);
    expect(offsets.at(-1)).toBe(1);
    expect(offsets).toEqual(offsets.toSorted((a, b) => a - b));
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it('carries all four features a cylinder needs', () => {
    // 1. a specular above the body, in the first half
    const specular = GLOSS.filter(([offset]) => offset < 0.5).map(([, delta]) => delta);
    expect(Math.max(...specular)).toBeGreaterThan(0);
    // 2. the body colour itself, somewhere in the middle
    expect(GLOSS.some(([offset, delta]) => delta === 0 && offset > 0.2 && offset < 0.7)).toBe(true);
    // 3. a shadow side
    expect(Math.min(...lightness)).toBeLessThan(-4);
    // 4. a bounce: the far edge lifts back up off the darkest band
    const darkest = Math.min(...lightness);
    expect(lightness.at(-1), 'without the bounce the tube reads as a flat ramp').toBeGreaterThan(
      darkest
    );
  });

  it('keeps the specular narrow rather than a broad band', () => {
    const peak = Math.max(...lightness);
    const atPeak = GLOSS.find(([, delta]) => delta === peak);
    expect(atPeak?.[0]).toBeLessThanOrEqual(0.25);
  });

  it('separates a bright reflection from the shaded cylinder flank', () => {
    expect(Math.max(...lightness)).toBeGreaterThanOrEqual(25);
    expect(Math.min(...lightness)).toBeLessThanOrEqual(-10);
    expect(Math.max(...lightness) - Math.min(...lightness)).toBeLessThan(50);
  });

  it('never slides a cord toward grey', () => {
    // Darkening by scaling channels was the first attempt and dropped rose's
    // shadow to 38% saturation against the reference's 55%, which is what
    // washed the mark out.
    expect(Math.min(...saturation)).toBeGreaterThan(-22);
    expect(Math.max(...saturation)).toBeLessThanOrEqual(0);
  });
});

describe('contact shading', () => {
  it('darkens every underpass and leaves every overpass unshadowed', () => {
    for (const which of ['warp', 'weft'] as const) {
      for (const index of COLS) {
        const stops = contactShadowStops(which, index);
        for (const crossing of ROWS) {
          const under =
            which === 'warp'
              ? horizontalIsOver(crossing, index)
              : !horizontalIsOver(index, crossing);
          const near = centreAt(crossing) - CORD_WIDTH / 2;
          const far = centreAt(crossing) + CORD_WIDTH / 2;
          const at = (position: number) => stops.find(([offset]) => offset === position)?.[1];
          if (under) {
            expect(at(near)).toBeGreaterThan(0.3);
            expect(at(far)).toBeGreaterThan(0.3);
            expect(at(near - CONTACT_SHADOW_REACH)).toBe(0);
            expect(at(far + CONTACT_SHADOW_REACH)).toBe(0);
          } else {
            expect(at(near)).toBeUndefined();
            expect(at(far)).toBeUndefined();
          }
        }
      }
    }
  });

  it('keeps fading shadows ordered, inside the cord, and clear of their neighbours', () => {
    expect(CONTACT_SHADOW_REACH * 2).toBeLessThan(CORD_GAP);
    for (const which of ['warp', 'weft'] as const) {
      for (const index of COLS) {
        const stops = contactShadowStops(which, index);
        const offsets = stops.map(([offset]) => offset);
        expect(offsets).toEqual(offsets.toSorted((a, b) => a - b));
        expect(new Set(offsets).size).toBe(offsets.length);
        expect(offsets.at(0)).toBe((CANVAS - MARK_SPAN) / 2);
        expect(offsets.at(-1)).toBe((CANVAS + MARK_SPAN) / 2);
        for (const [, opacity] of stops) {
          expect(opacity).toBeGreaterThanOrEqual(0);
          expect(opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('paints the same silhouette for body and contact shadow', () => {
    for (const which of ['warp', 'weft'] as const) {
      const svg = layerSvg(which);
      const shapes = [...svg.matchAll(/<(rect|path) ([^/]*)\/>/g)].map((match) => match[0]);
      expect(shapes).toHaveLength(6);
      for (const index of COLS) {
        const body = shapes[index * 2];
        const contact = shapes[index * 2 + 1];
        expect(contact).toBe(
          body?.replace(`url(#${which}-${index})`, `url(#${which}-${index}-contact)`)
        );
        expect(svg).toContain(`id="${which}-${index}-contact"`);
      }
      expect([...svg.matchAll(/<ellipse /g)]).toHaveLength(3);
      expect(svg).toContain('<radialGradient id="cap-highlight">');
    }
  });
});

describe('the icon manifest', () => {
  it('composites top-first, so the weft group lands above the warp', () => {
    expect(groupsOf(iconManifest())).toHaveLength(2);
    expect(imageOf(groupAt(iconManifest(), 0))).toBe('layer-weft.svg');
    expect(imageOf(groupAt(iconManifest(), 1))).toBe('layer-warp.svg');
  });

  it('disables the extra bevel that makes cut crossings look recessed', () => {
    for (const group of groupsOf(iconManifest())) expect(group.specular).toBe(false);
  });

  it('leaves translucency off, because the cut-outs already put the warp in front', () => {
    expect(UPPER_TRANSLUCENCY).toBe(0);
    for (const group of groupsOf(iconManifest())) {
      expect(group.translucency).toEqual({ enabled: false, value: 0 });
    }
  });

  it('asks the system for a shadow under every group, which is where the depth comes from', () => {
    for (const group of groupsOf(iconManifest())) {
      expect(group.shadow).toEqual({ kind: 'neutral', opacity: SHADOW_OPACITY });
      const layer = group.layers[0];
      expect(layer?.opacity).toBe(1);
      expect(layer?.position.scale).toBe(1);
    }
  });

  it('puts the local badge on top of the mark, not under it', () => {
    const badged = iconManifest({ badge: 'local-badge.png' });
    expect(groupsOf(badged)).toHaveLength(3);
    expect(imageOf(groupAt(badged, 0))).toBe('local-badge.png');
    expect(groupAt(badged, 0).translucency.enabled).toBe(false);
    expect(groupAt(badged, 0).specular).toBe(true);
  });

  it('references only layers the generator writes, plus the badge', () => {
    for (const bundle of BUNDLES) {
      const allowed = new Set(
        [...Object.keys(LAYER_FILES), bundle.badge].filter((name) => name !== undefined)
      );
      for (const group of groupsOf(iconManifest({ badge: bundle.badge }))) {
        expect(allowed, `${bundle.path} names ${imageOf(group)}`).toContain(imageOf(group));
      }
    }
  });
});

describe('the committed bundles', () => {
  it('match what the generator produces', () => {
    for (const bundle of BUNDLES) {
      for (const [relative, contents] of bundleFiles(bundle)) {
        const actual = readFileSync(join(repoRoot, bundle.path, relative), 'utf8');
        expect(actual, `${bundle.path}/${relative} is stale — run \`mise run icon:ios\``).toBe(
          contents
        );
      }
    }
  });

  it('carry no asset the generator does not own', () => {
    for (const bundle of BUNDLES) {
      const owned = new Set(
        [...Object.keys(LAYER_FILES), bundle.badge].filter((name) => name !== undefined)
      );
      const present = readdirSync(join(repoRoot, bundle.path, 'Assets'));
      for (const file of present) {
        expect(owned, `${bundle.path}/Assets/${file} is orphaned`).toContain(file);
      }
      expect(present).toHaveLength(owned.size);
    }
  });

  it('use the same layers in both bundles', () => {
    const [first, ...rest] = BUNDLES.map((bundle) =>
      Object.keys(LAYER_FILES).map((name) =>
        readFileSync(join(repoRoot, bundle.path, 'Assets', name), 'utf8')
      )
    );
    for (const other of rest) expect(other).toEqual(first);
  });
});
