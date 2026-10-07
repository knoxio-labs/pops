import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripJsonComments } from '../check-composite-references.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findBuildConfigs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ['.git', 'dist', 'node_modules'].includes(entry.name) ? [] : findBuildConfigs(path);
    }
    return entry.isFile() && entry.name === 'tsconfig.build.json' ? [path] : [];
  });
}

const compositeConfigs = ['libs', 'pillars']
  .flatMap((group) => findBuildConfigs(join(root, group)))
  .flatMap((configPath) => {
    const parsed: unknown = JSON.parse(stripJsonComments(readFileSync(configPath, 'utf8')));
    if (!isRecord(parsed) || !isRecord(parsed['compilerOptions'])) return [];
    return parsed['compilerOptions']['composite'] === true
      ? [{ configPath, compilerOptions: parsed['compilerOptions'] }]
      : [];
  });

describe('composite TypeScript build info', () => {
  it('discovers composite build configs in every unit tree', () => {
    expect(compositeConfigs.length).toBeGreaterThan(0);
  });

  for (const { configPath, compilerOptions } of compositeConfigs) {
    it(`${configPath.slice(root.length + 1)} stores build info under dist`, () => {
      expect(compilerOptions['tsBuildInfoFile']).toBe('dist/tsconfig.build.tsbuildinfo');
    });
  }

  it('excludes TypeScript build metadata from Docker build contexts', () => {
    const patterns = readFileSync(join(root, '.dockerignore'), 'utf8')
      .split(/\r?\n/)
      .map((pattern) => pattern.trim());
    expect(patterns).toContain('**/*.tsbuildinfo');
  });
});
