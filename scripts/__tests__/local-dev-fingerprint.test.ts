import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverUnits } from '../local-dev/discovery.mjs';
import { validationFingerprint } from '../local-dev/fingerprint.mjs';
import { privateInputs } from '../local-dev/private-inputs.mjs';

const TIMEOUT = 60_000;
describe('validation input fingerprint', { timeout: TIMEOUT }, () => {
  it('accepts real discovery paths and invalidates source, generated and installed inputs', async () => {
    mkdirSync(resolve('tmp'), { recursive: true });
    const root = mkdtempSync(resolve('tmp/fingerprint-'));
    const unit = join(root, 'libs/example');
    mkdirSync(unit, { recursive: true });
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      writeFileSync(join(root, '.gitignore'), 'node_modules/\ndist/\n');
      writeFileSync(
        join(unit, 'package.json'),
        JSON.stringify({ name: 'example', scripts: { typecheck: 'tsc --noEmit' } })
      );
      writeFileSync(join(unit, 'source.ts'), 'export const value=1;');
      const units = await discoverUnits({ cwd: root, verifyTrust: false });
      expect(units[0]?.unitPath).toBe(unit);
      const paths = units.map((u) => u.unitPath);
      const fingerprint = () => validationFingerprint(root, paths, {});
      const original = fingerprint();
      writeFileSync(join(unit, 'source.ts'), 'export const value=2;');
      const changedSource = fingerprint();
      expect(changedSource).not.toBe(original);
      mkdirSync(join(unit, 'dist'), { recursive: true });
      writeFileSync(join(unit, 'dist/index.d.ts'), 'export declare const value: number;');
      const generated = fingerprint();
      expect(generated).not.toBe(changedSource);
      mkdirSync(join(root, 'node_modules'), { recursive: true });
      writeFileSync(join(root, 'node_modules/.modules.yaml'), 'layoutVersion: 5');
      const installed = fingerprint();
      expect(installed).not.toBe(generated);
      writeFileSync(join(root, 'node_modules/.modules.yaml'), 'layoutVersion: 6');
      expect(fingerprint()).not.toBe(installed);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('refuses receipt reuse in the presence of private environment and local mise overrides', () => {
    mkdirSync(resolve('tmp'), { recursive: true });
    const root = mkdtempSync(resolve('tmp/private-inputs-'));
    try {
      mkdirSync(join(root, 'libs/example/.config/mise'), { recursive: true });
      writeFileSync(join(root, '.env.example'), 'EXAMPLE=placeholder');
      expect(privateInputs(root, ['libs/example'])).toEqual([]);
      writeFileSync(join(root, '.env'), 'LOCAL_SETTING=fixture');
      writeFileSync(
        join(root, 'libs/example/.config/mise/config.local.toml'),
        '[env]\nLOCAL_SETTING="fixture"'
      );
      expect(privateInputs(root, ['libs/example'])).toEqual([
        '.env',
        'libs/example/.config/mise/config.local.toml',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
