import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ARTWORK_PATHS,
  CANVAS_UNITS,
  CORD_GAP,
  CORD_OFFSETS,
  CORD_WIDTH,
  CROSSING_CLEARANCE,
  MARK_SPAN,
  PALETTE,
  RENDER_PIXELS,
  WARP,
  WEFT,
  colorAt,
  decodePng,
  encodePng,
  horizontalIsOver,
  renderArtwork,
} from '../ios-app-icon.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const HALF_SPAN = MARK_SPAN / 2;
const ROWS = [0, 1, 2];
const COLS = [0, 1, 2];

/** Centre offset of one of the three parallel cords, by index. */
function cordOffset(index: number): number {
  const value = CORD_OFFSETS[index];
  if (value === undefined) throw new Error(`no cord at index ${index}`);
  return value;
}

describe('the palette is the nav palette', () => {
  it('carries exactly the members of NAV_COLOR', () => {
    const source = readFileSync(join(repoRoot, 'libs/sdk/src/manifest-schema/ui.ts'), 'utf8');
    const declaration = /const NAV_COLOR = z\.enum\(\[([^\]]*)\]\)/.exec(source);
    expect(declaration, 'NAV_COLOR is no longer a z.enum literal in ui.ts').not.toBeNull();

    const members = [...(declaration?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(members).toHaveLength(6);
    expect(members.toSorted()).toEqual(Object.keys(PALETTE).toSorted());
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

  it('shows the over-cord at the centre of every crossing', () => {
    for (const row of ROWS) {
      for (const col of COLS) {
        const expected = horizontalIsOver(row, col) ? WEFT[row] : WARP[col];
        expect(colorAt(cordOffset(col), cordOffset(row))).toBe(expected);
      }
    }
  });

  it('opens a gap in the under-cord alongside the cord crossing it', () => {
    const justOutside = CORD_WIDTH / 2 + CROSSING_CLEARANCE / 2;
    const wellOutside = CORD_WIDTH / 2 + CROSSING_CLEARANCE * 2;

    for (const row of ROWS) {
      for (const col of COLS) {
        // Step away from the crossing along the OVER-cord's own axis: that is
        // the direction the under-cord reappears in.
        const point = (distance: number): [number, number] =>
          horizontalIsOver(row, col)
            ? [cordOffset(col), cordOffset(row) + distance]
            : [cordOffset(col) + distance, cordOffset(row)];

        for (const sign of [-1, 1]) {
          const [gapX, gapY] = point(sign * justOutside);
          expect(colorAt(gapX, gapY), `crossing ${row},${col} has no clearance gap`).toBeNull();

          const [bodyX, bodyY] = point(sign * wellOutside);
          const underCord = horizontalIsOver(row, col) ? WARP[col] : WEFT[row];
          expect(colorAt(bodyX, bodyY), `crossing ${row},${col} swallowed the under-cord`).toBe(
            underCord
          );
        }
      }
    }
  });
});

describe('the geometry', () => {
  const extentAlong = (axis: 'x' | 'y', offsetUnits: number): [number, number] => {
    const covered: number[] = [];
    for (let along = -CANVAS_UNITS / 2; along <= CANVAS_UNITS / 2; along += 0.5) {
      const name = axis === 'x' ? colorAt(along, offsetUnits) : colorAt(offsetUnits, along);
      if (name !== null) covered.push(along);
    }
    const first = covered.at(0);
    const last = covered.at(-1);
    if (first === undefined || last === undefined)
      throw new Error(`nothing covered at ${offsetUnits}`);
    return [first, last];
  };

  it('gives all six cords the same length, centred', () => {
    for (const offset of CORD_OFFSETS) {
      for (const axis of ['x', 'y'] as const) {
        const [first, last] = extentAlong(axis, offset);
        expect(
          Math.abs(first + HALF_SPAN),
          `${axis} cord at ${offset} starts at ${first}`
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(last - HALF_SPAN),
          `${axis} cord at ${offset} ends at ${last}`
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it('leaves every cord end a stub longer than the cord is wide', () => {
    const outerEdge = CORD_OFFSETS[2] + CORD_WIDTH / 2;
    expect(HALF_SPAN - outerEdge).toBeGreaterThan(CORD_WIDTH);
  });

  it('keeps the whole mark clear of the canvas edge', () => {
    const margin = CANVAS_UNITS / 2 - HALF_SPAN;
    expect(margin).toBeGreaterThan(CORD_WIDTH / 3);

    for (let along = -CANVAS_UNITS / 2; along <= CANVAS_UNITS / 2; along += 1) {
      const edge = CANVAS_UNITS / 2 - 1;
      expect(colorAt(along, -edge)).toBeNull();
      expect(colorAt(along, edge)).toBeNull();
      expect(colorAt(-edge, along)).toBeNull();
      expect(colorAt(edge, along)).toBeNull();
    }
  });

  it('leaves the squircle corners empty', () => {
    const corner = CANVAS_UNITS / 2 - CORD_WIDTH;
    for (const x of [-corner, corner]) {
      for (const y of [-corner, corner]) {
        expect(colorAt(x, y)).toBeNull();
      }
    }
  });

  it('keeps a background channel between parallel cords', () => {
    expect(CORD_GAP).toBeGreaterThan(CORD_WIDTH / 2);
    const between = (CORD_OFFSETS[0] + CORD_OFFSETS[1]) / 2;
    expect(colorAt(between, -HALF_SPAN + CORD_WIDTH)).toBeNull();
  });
});

describe('the artwork is flat', () => {
  const { pixels, data } = renderArtwork(256, 2);
  const channel = (index: number): number => {
    const value = data[index];
    if (value === undefined) throw new Error(`no channel at ${index}`);
    return value;
  };
  const at = (px: number, py: number): [number, number, number, number] => {
    const base = (py * pixels + px) * 4;
    return [channel(base), channel(base + 1), channel(base + 2), channel(base + 3)];
  };
  const toCanvas = (units: number) =>
    Math.round(((units + CANVAS_UNITS / 2) / CANVAS_UNITS) * pixels);

  it('paints no gradient along a cord', () => {
    for (const offset of CORD_OFFSETS) {
      const px = toCanvas(offset);
      const samples = new Set<string>();
      for (let units = -HALF_SPAN + CORD_WIDTH; units <= HALF_SPAN - CORD_WIDTH; units += 8) {
        const [r, g, b, a] = at(px, toCanvas(units));
        if (a === 255) samples.add(`${r},${g},${b}`);
      }
      expect(
        samples.size,
        `the cord at ${offset} is shaded across ${samples.size} tones`
      ).toBeLessThanOrEqual(3);
    }
  });

  it('paints only palette colours on the cord centrelines', () => {
    const palette = new Set(
      Object.values(PALETTE).map((hex) =>
        [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(',')
      )
    );
    for (const row of CORD_OFFSETS) {
      for (const col of CORD_OFFSETS) {
        const [r, g, b, a] = at(toCanvas(col), toCanvas(row));
        expect(a).toBe(255);
        expect(palette).toContain(`${r},${g},${b}`);
      }
    }
  });

  it('leaves the background fully transparent rather than near-black', () => {
    const [, , , alpha] = at(toCanvas(0), toCanvas(-CANVAS_UNITS / 2 + CORD_WIDTH / 2));
    expect(alpha).toBe(0);
  });
});

describe('the PNG codec', () => {
  it('round-trips the pixels it wrote', () => {
    const { pixels, data } = renderArtwork(64, 1);
    const decoded = decodePng(encodePng(pixels, data));
    expect(decoded.pixels).toBe(pixels);
    expect(Buffer.from(decoded.data).equals(Buffer.from(data))).toBe(true);
  });

  it('rejects anything that is not the PNG it writes', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
  });
});

describe('the committed artwork', () => {
  it('matches what the generator produces', () => {
    const { pixels, data } = renderArtwork();
    for (const relative of ARTWORK_PATHS) {
      const decoded = decodePng(readFileSync(join(repoRoot, relative)));
      expect(decoded.pixels, relative).toBe(pixels);
      expect(
        Buffer.from(decoded.data).equals(Buffer.from(data)),
        `${relative} is stale — run \`mise run icon:ios\``
      ).toBe(true);
    }
  }, 60_000);

  it('is the same bytes in both icon bundles', () => {
    const files = ARTWORK_PATHS.map((relative) => readFileSync(join(repoRoot, relative)));
    const reference = files.at(0);
    if (reference === undefined) throw new Error('ARTWORK_PATHS is empty');
    for (const other of files) expect(other.equals(reference)).toBe(true);
  });

  it('is rasterised at twice the canvas, for the 0.5 scale icon.json asks for', () => {
    expect(RENDER_PIXELS).toBe(CANVAS_UNITS * 2);
    for (const relative of ARTWORK_PATHS) {
      const bundle = join(repoRoot, relative, '..', '..', 'icon.json');
      const icon = JSON.parse(readFileSync(bundle, 'utf8'));
      const weave = icon.groups
        .flatMap(
          (group: { layers: { 'image-name': string; position: { scale: number } }[] }) =>
            group.layers
        )
        .find((layer: { 'image-name': string }) => layer['image-name'] === 'layer-weave.png');
      expect(weave, `${relative} is not referenced by its icon.json`).toBeDefined();
      expect(weave.position.scale).toBe(CANVAS_UNITS / RENDER_PIXELS);
    }
  });
});
