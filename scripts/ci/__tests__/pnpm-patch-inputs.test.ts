import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../config-parse.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

function declaredPatches(source: string): string[] {
  const workspace = parseYaml(source, 'pnpm-workspace.yaml');
  if (!isMapping(workspace) || !isMapping(workspace.patchedDependencies))
    throw new Error('Missing patchedDependencies mapping');
  const patches = Object.values(workspace.patchedDependencies);
  if (patches.length === 0 || !patches.every((path) => typeof path === 'string'))
    throw new Error('Expected nonempty patch file paths');
  if (patches.some((path) => path.length === 0))
    throw new Error('Expected nonempty patch file paths');
  return patches;
}

function dockerfiles(): string[] {
  return readdirSync(join(repoRoot, 'pillars'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const pillar = `pillars/${entry.name}`;
      const directories = [pillar];
      if (existsSync(join(repoRoot, pillar, 'app'))) directories.push(`${pillar}/app`);
      return directories.flatMap((directory) =>
        readdirSync(join(repoRoot, directory))
          .filter((name) => name === 'Dockerfile' || name.startsWith('Dockerfile.'))
          .map((name) => `${directory}/${name}`)
      );
    })
    .toSorted();
}

function copyArguments(instruction: string): string[] {
  const argumentsText = instruction.replace(/^COPY\s+/iu, '').replace(/^(?:--\S+\s+)*/u, '');
  if (!argumentsText.startsWith('[')) return argumentsText.trim().split(/\s+/u);
  const parsed: unknown = JSON.parse(argumentsText);
  if (!Array.isArray(parsed) || !parsed.every((argument) => typeof argument === 'string'))
    throw new Error('Unsupported COPY argument shape');
  return parsed;
}

function patchCopyViolations(source: string, patches: readonly string[]): string[] {
  const available = new Set<string>();
  const violations: string[] = [];
  let directory = '/';
  let installs = 0;
  for (const line of source.replace(/\\\r?\n/gu, ' ').split('\n')) {
    const instruction = line.trim();
    if (/^FROM\s/iu.test(instruction)) {
      available.clear();
      directory = '/';
    } else if (/^WORKDIR\s/iu.test(instruction)) {
      directory = posix.resolve(directory, instruction.replace(/^WORKDIR\s+/iu, ''));
    } else if (/^COPY\s/iu.test(instruction) && !/^COPY\s+[^\n]*--from=/iu.test(instruction)) {
      try {
        const args = copyArguments(instruction);
        const destination = args.at(-1);
        if (destination === undefined || args.length < 2) throw new Error('Missing COPY operands');
        for (const from of args.slice(0, -1)) {
          const origin = posix.normalize(from);
          for (const patch of patches) {
            const relative = posix.relative(origin, patch);
            if (relative.startsWith('../') || relative === '..') continue;
            let target = posix.join(destination, relative);
            if (relative === '') {
              target = destination;
              if (destination.endsWith('/') || args.length > 2)
                target = posix.join(destination, posix.basename(patch));
            }
            available.add(posix.resolve(directory, target));
          }
        }
      } catch (error) {
        violations.push(error instanceof Error ? error.message : String(error));
      }
    } else if (/^RUN\s/iu.test(instruction) && /\bpnpm\s+install\b/u.test(instruction)) {
      installs += 1;
      for (const patch of patches)
        if (!available.has(posix.resolve(directory, patch)))
          violations.push(`Missing ${patch} before pnpm install`);
    }
  }
  if (installs === 0) violations.push('Missing pnpm install instruction');
  return violations;
}

const patchPaths = declaredPatches(readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'));
const images = dockerfiles();

describe('dependency patch inputs', () => {
  it('reads declared paths instead of assuming a package or patch name', () => {
    expect(declaredPatches('patchedDependencies: { "tool@1": "patches/tool.patch" }')).toEqual([
      'patches/tool.patch',
    ]);
    expect(() => declaredPatches('packages: []')).toThrow('Missing patchedDependencies');
    expect(() => declaredPatches('patchedDependencies: []')).toThrow('Missing patchedDependencies');
    expect(() => declaredPatches('patchedDependencies: {}')).toThrow('nonempty patch file paths');
    expect(() => declaredPatches('patchedDependencies: { "tool@1": "" }')).toThrow(
      'nonempty patch file paths'
    );
    expect(() => declaredPatches('patchedDependencies: { "tool@1": false }')).toThrow(
      'nonempty patch file paths'
    );
    for (const patch of patchPaths) expect(existsSync(join(repoRoot, patch))).toBe(true);
  });

  it('discovers the install images including frontend and alternate images', () => {
    expect(images.length).toBeGreaterThanOrEqual(31);
    expect(images).toContain('pillars/bfm/Dockerfile');
    expect(images).toContain('pillars/contacts/Dockerfile');
    expect(images).toContain('pillars/design/Dockerfile.api');
    expect(images).toContain('pillars/trips/app/Dockerfile');
    expect(images.filter((path) => path.includes('/app/')).length).toBeGreaterThanOrEqual(10);
  });

  it.each(images)('%s makes every patch available before installation', (path) => {
    expect(patchCopyViolations(readFileSync(join(repoRoot, path), 'utf8'), patchPaths)).toEqual([]);
  });

  it.each([
    'COPY patches/ ./patches/',
    'COPY ["patches/", "./patches/"]',
    'COPY patches/tool.patch ./patches/',
    'COPY . .',
  ])('accepts a pre-install patch copy: %s', (copy) => {
    expect(
      patchCopyViolations(`FROM node\nWORKDIR /app\n${copy}\nRUN pnpm install --frozen-lockfile`, [
        'patches/tool.patch',
      ])
    ).toEqual([]);
  });

  it('follows continued RUN instructions to their installation boundary', () => {
    expect(
      patchCopyViolations(
        [
          'FROM node',
          'WORKDIR /app',
          'COPY patches/ ./patches/',
          'RUN corepack enable && \\',
          '  pnpm install --frozen-lockfile',
        ].join('\n'),
        ['patches/tool.patch']
      )
    ).toEqual([]);
  });

  it.each([
    'RUN pnpm install --frozen-lockfile',
    'RUN pnpm install --frozen-lockfile\nCOPY patches/ ./patches/',
    'COPY patches/ ./\nRUN pnpm install --frozen-lockfile',
    'COPY patches/ ./patches/\nFROM node\nWORKDIR /app\nRUN pnpm install --frozen-lockfile',
    'COPY --from=builder /app/patches ./patches\nRUN pnpm install --frozen-lockfile',
  ])('reports missing patches at the actual install boundary: %s', (instructions) => {
    expect(
      patchCopyViolations(`FROM node\nWORKDIR /app\n${instructions}`, ['patches/tool.patch'])
    ).toContain('Missing patches/tool.patch before pnpm install');
  });

  it('reports a missing install or malformed COPY rather than passing an empty scan', () => {
    expect(patchCopyViolations('FROM node', ['patches/tool.patch'])).toContain(
      'Missing pnpm install instruction'
    );
    expect(
      patchCopyViolations('FROM node\nCOPY [false]\nRUN pnpm install', ['patches/tool.patch'])
    ).toContain('Unsupported COPY argument shape');
  });

  it('widens unit discovery for root patch paths only', () => {
    const workflow = readFileSync(join(repoRoot, '.github/workflows/_discover-units.yml'), 'utf8');
    const pattern = /shared_root_pattern='([^']+)'/u.exec(workflow)?.[1];
    if (pattern === undefined) throw new Error('Missing shared-root discovery pattern');
    expect(new RegExp(pattern, 'u').test('patches/tool.patch')).toBe(true);
    expect(new RegExp(pattern, 'u').test('patches/nested/tool.patch')).toBe(true);
    expect(new RegExp(pattern, 'u').test('other/patches/tool.patch')).toBe(false);
  });
});
