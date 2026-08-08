import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseExposedPort,
  parseRuntimeBaseImage,
  planSmoke,
  resolveHealthPath,
} from '../smoke-image.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('parseExposedPort', () => {
  it('reads the exposed port', () => {
    expect(parseExposedPort('FROM node:24-slim\nEXPOSE 3004\nCMD ["node", "x.js"]\n')).toBe(3004);
  });

  it('is case-insensitive and tolerates leading whitespace', () => {
    expect(parseExposedPort('FROM x\n  expose 80\n')).toBe(80);
  });

  it('accepts the same port repeated across stages', () => {
    expect(parseExposedPort('FROM x AS a\nEXPOSE 3001\nFROM y\nEXPOSE 3001\n')).toBe(3001);
  });

  it('refuses a Dockerfile with no EXPOSE rather than guessing a port', () => {
    expect(() => parseExposedPort('FROM node:24-slim\nCMD ["node"]\n')).toThrow(/no EXPOSE/u);
  });

  it('refuses two distinct exposed ports rather than picking one', () => {
    expect(() => parseExposedPort('FROM x\nEXPOSE 80\nEXPOSE 443\n')).toThrow(/ambiguous/u);
  });
});

describe('parseRuntimeBaseImage', () => {
  it('returns the final stage base, not the builder', () => {
    const dockerfile = 'FROM node:24-slim AS builder\nRUN true\nFROM nginx:1.31.3-alpine\n';
    expect(parseRuntimeBaseImage(dockerfile)).toBe('nginx:1.31.3-alpine');
  });

  it('throws on input with no FROM', () => {
    expect(() => parseRuntimeBaseImage('EXPOSE 80\n')).toThrow(/no FROM/u);
  });
});

describe('resolveHealthPath', () => {
  it('probes / for nginx-served images', () => {
    expect(resolveHealthPath('nginx:1.31.3-alpine')).toBe('/');
  });

  it('probes /health for application images', () => {
    expect(resolveHealthPath('node:24-slim')).toBe('/health');
    expect(resolveHealthPath('debian:bookworm-slim')).toBe('/health');
  });

  it('does not treat a lookalike name as nginx', () => {
    expect(resolveHealthPath('nginxinc-unofficial:1')).toBe('/health');
  });
});

describe('planSmoke — every pillar Dockerfile on disk', () => {
  const dockerfiles = readdirSync(join(repoRoot, 'pillars'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('pillars', entry.name, 'Dockerfile'))
    .filter((relative) => {
      try {
        readFileSync(join(repoRoot, relative));
        return true;
      } catch {
        return false;
      }
    });

  it('finds Dockerfiles to check (the discovery itself is not silently empty)', () => {
    expect(dockerfiles.length).toBeGreaterThan(0);
  });

  it.each(dockerfiles)('%s yields a usable smoke plan', (relative) => {
    const plan = planSmoke(readFileSync(join(repoRoot, relative), 'utf8'));
    expect(plan.port).toBeGreaterThan(0);
    expect(plan.healthPath.startsWith('/')).toBe(true);
  });
});

describe('the deploy step every Node pillar image depends on', () => {
  // Regression guard for the pnpm 11 `--legacy` deploy: it writes relative
  // `@pops/*` symlinks that escape /app/deploy, so the image builds clean and
  // the container dies on its first import. The runtime smoke is the real
  // gate; this is the fast, docker-free half that names the fix.
  const dockerfiles = readdirSync(join(repoRoot, 'pillars'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(repoRoot, 'pillars', entry.name, 'Dockerfile'))
    .filter((path) => {
      try {
        readFileSync(path);
        return true;
      } catch {
        return false;
      }
    });

  it.each(dockerfiles)('%s does not use `pnpm deploy --legacy`', (path) => {
    const text = readFileSync(path, 'utf8');
    const deployLines = text
      .split('\n')
      .filter((line) => /^\s*RUN\s.*\bpnpm\b.*\bdeploy\b/u.test(line));
    for (const line of deployLines) {
      expect(line).not.toContain('--legacy');
      expect(line).toContain('--config.inject-workspace-packages=true');
    }
  });
});
