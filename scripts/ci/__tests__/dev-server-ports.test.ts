/**
 * No two servers in this repo claim the same TCP port.
 *
 * `pillars/shell`'s `chromium-finance-only` Playwright webServer bound 5569,
 * and so does `pillars/design`'s Vite dev server. Playwright's
 * `reuseExistingServer` is on outside CI, so with a design server already
 * running — which is how the playground is worked on — a local `pnpm test:e2e`
 * never started the shell. It attached to the design app and ran the
 * finance-only specs against it.
 *
 * What makes that worth a guard rather than a note is how it presents. It does
 * not look like a port collision; it looks like the product is broken:
 *
 * ```
 * Error: expect(locator).toBeVisible() failed
 *   - waiting for getByRole('textbox', { name: 'Search POPS' })
 * ```
 *
 * Passing in CI (which sets `CI`, so it never reuses) and failing locally
 * reads as "the local tree is wrong", which sends the reader at their own
 * change. Confirming the real cause took an `lsof` and a `ps` (POPS-3249).
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** One port, and the file that claims it. */
export interface PortClaim {
  readonly port: number;
  /** Repo-relative path of the file claiming it. */
  readonly file: string;
}

/**
 * The three ways a port is claimed in this repo, as they are actually
 * written.
 *
 * Anchored enough not to sweep in a number that merely looks like one: the
 * hex colour `'#475569'` in `libs/ui/src/theme/graph-colors.ts` is four
 * digits inside a string and matches none of these.
 */
const PORT_PATTERNS: readonly RegExp[] = [
  /(?:^|[^\w$])"?port"?:\s*(\d{4,5})\b/gu, // a Vite `server.port`, or a launch.json entry
  /\b[A-Z][A-Z0-9_]*_PORT\s*=\s*(\d{4,5})\b/gu, // a Playwright webServer constant
  /--port[ =](\d{4,5})\b/gu, // a `dev` script's flag
];

/** Every port a single file claims. */
export function portsClaimedIn(text: string): number[] {
  const found = new Set<number>();
  for (const pattern of PORT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      if (raw !== undefined) found.add(Number(raw));
    }
  }
  return [...found].toSorted((a, b) => a - b);
}

/** Files that can claim a dev-server port, by name. */
function claimsPorts(fileName: string): boolean {
  return (
    /^vite(\.[\w-]+)?\.config\.ts$/u.test(fileName) ||
    fileName === 'playwright.config.ts' ||
    fileName === 'launch.json'
  );
}

/** Every port claim across `pillars/*` and `.claude/launch.json`. */
export function collectPortClaims(root = repoRoot): PortClaim[] {
  const claims: PortClaim[] = [];
  const record = (path: string): void => {
    for (const port of portsClaimedIn(readFileSync(path, 'utf8'))) {
      claims.push({ port, file: relative(root, path) });
    }
  };

  const pillarsRoot = join(root, 'pillars');
  for (const pillar of readdirSync(pillarsRoot, { withFileTypes: true })) {
    if (!pillar.isDirectory()) continue;
    // `pillars/<id>` and `pillars/<id>/app`, which is where a standalone
    // Vite config lives.
    for (const dir of [join(pillarsRoot, pillar.name), join(pillarsRoot, pillar.name, 'app')]) {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && claimsPorts(entry.name)) record(join(dir, entry.name));
      }
    }
  }

  const launch = join(root, '.claude', 'launch.json');
  if (existsSync(launch)) record(launch);

  return claims;
}

/** Ports claimed by more than one file, with every claimant. */
export function collisions(claims: readonly PortClaim[]): { port: number; files: string[] }[] {
  const byPort = new Map<number, Set<string>>();
  for (const claim of claims) {
    const files = byPort.get(claim.port) ?? new Set<string>();
    files.add(claim.file);
    byPort.set(claim.port, files);
  }
  return [...byPort.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([port, files]) => ({ port, files: [...files].toSorted() }))
    .toSorted((a, b) => a.port - b.port);
}

const claims = collectPortClaims();

describe('dev-server ports', () => {
  it('finds ports to check — an empty scan would pass this file vacuously', () => {
    // shell's Vite, its two Playwright webServers, design's Vite and
    // purchases' standalone Vite are five between them.
    expect(claims.length).toBeGreaterThanOrEqual(5);
  });

  it('has no two files claiming one port', () => {
    expect(
      collisions(claims),
      'Two servers on one port means Playwright’s `reuseExistingServer` can attach to the ' +
        'wrong one, which presents as a broken product rather than as a busy port.'
    ).toEqual([]);
  });

  it('reads the shapes a port is actually written in', () => {
    expect(portsClaimedIn('  server: {\n    port: 5568,\n  }')).toEqual([5568]);
    expect(portsClaimedIn('const FINANCE_ONLY_PORT = 5571;')).toEqual([5571]);
    expect(portsClaimedIn('command: `pnpm dev --port 5567 --strictPort`')).toEqual([5567]);
    expect(portsClaimedIn('"port": 3000')).toEqual([3000]);
  });

  it('does not mistake a four-digit number for a port', () => {
    // The one in the tree: a hex colour in `libs/ui/src/theme/graph-colors.ts`.
    expect(portsClaimedIn("legendText: '#475569',")).toEqual([]);
    expect(portsClaimedIn('const TIMEOUT_MS = 5569;')).toEqual([]);
  });

  it('reports a collision, naming every file that claims the port', () => {
    const found = collisions([
      { port: 5569, file: 'pillars/design/vite.config.ts' },
      { port: 5569, file: 'pillars/shell/playwright.config.ts' },
      { port: 5568, file: 'pillars/shell/vite.config.ts' },
    ]);

    expect(found).toEqual([
      {
        port: 5569,
        files: ['pillars/design/vite.config.ts', 'pillars/shell/playwright.config.ts'],
      },
    ]);
  });

  it('does not report one file claiming a port twice — a config may repeat itself', () => {
    expect(
      collisions([
        { port: 5567, file: 'pillars/shell/playwright.config.ts' },
        { port: 5567, file: 'pillars/shell/playwright.config.ts' },
      ])
    ).toEqual([]);
  });
});
