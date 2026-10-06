#!/usr/bin/env tsx
/**
 * Build a runtime-only registry snapshot for E2E install-set switching.
 *
 * The snapshot uses the public `@pops/module-registry` API. `MODULES` is the
 * canonical generated manifest projection, `KNOWN_MODULES` retains every
 * known id, and `INSTALLED_MODULES` applies this process's `POPS_APPS` /
 * `POPS_OVERLAYS` values. This keeps the shell's E2E helper inside the same
 * declared package boundary that an extracted shell can install.
 *
 * Usage:
 *   tsx scripts/build-registry-snapshot.ts <output-file>
 *
 * The process environment must be set before invocation because the public
 * `INSTALLED_MODULES` export resolves it once at module load.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  INSTALLED_MODULES,
  KNOWN_MODULES,
  MODULES,
  type RegisteredModule,
} from '@pops/module-registry';

/** The three stable registry projections written to the E2E alias module. */
export interface RegistrySnapshot {
  readonly knownIds: readonly string[];
  readonly installedIds: readonly string[];
  readonly modules: readonly RegisteredModule[];
}

/** Keep the full known-id set while selecting only rows in the resolved install set. */
export function selectRegistrySnapshot(
  knownIds: readonly string[],
  modules: readonly RegisteredModule[],
  installedIds: readonly string[]
): RegistrySnapshot {
  const installed = new Set(installedIds);
  return {
    knownIds: [...knownIds].toSorted((a, b) => a.localeCompare(b, 'en')),
    installedIds: [...installedIds].toSorted((a, b) => a.localeCompare(b, 'en')),
    modules: modules
      .filter((module) => installed.has(module.id))
      .toSorted((a, b) => a.id.localeCompare(b.id, 'en')),
  };
}

function renderSnapshot(snapshot: RegistrySnapshot): string {
  const knownIdsLiteral = JSON.stringify(snapshot.knownIds);
  const installedIdsLiteral = JSON.stringify(snapshot.installedIds);
  const modulesLiteral = JSON.stringify(snapshot.modules, null, 2);
  return `/**
 * GENERATED — E2E install-set snapshot for @pops/module-registry.
 *
 * Emitted by pillars/shell/scripts/build-registry-snapshot.ts. Do not
 * commit. The Playwright harness rebuilds this file before each shell
 * server boots so distinct install sets can coexist in one test run.
 */
export const KNOWN_MODULES = Object.freeze(${knownIdsLiteral});

export const MODULES = Object.freeze(${modulesLiteral});

export const INSTALLED_MODULES = Object.freeze(${installedIdsLiteral});

export function findModule(id) {
  return MODULES.find((m) => m.id === id);
}

export function isModuleId(value) {
  return MODULES.some((m) => m.id === value);
}

export function isInstalledModule(value) {
  return INSTALLED_MODULES.includes(value);
}
`;
}

async function main(): Promise<void> {
  const outputArg = process.argv[2];
  if (outputArg === undefined || outputArg.length === 0) {
    process.stderr.write('build-registry-snapshot: missing output path argument\n');
    process.exit(1);
  }
  const outputPath = resolve(outputArg);
  const snapshot = selectRegistrySnapshot(KNOWN_MODULES, MODULES, INSTALLED_MODULES);

  // Keep all known ids alongside filtered module rows so the catch-all route
  // can distinguish an excluded module from an unknown URL.
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderSnapshot(snapshot), 'utf8');
  process.stdout.write(
    `build-registry-snapshot: wrote ${snapshot.modules.length} module${
      snapshot.modules.length === 1 ? '' : 's'
    } → ${outputPath} (POPS_APPS=${process.env.POPS_APPS ?? '<unset>'})\n`
  );
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`build-registry-snapshot failed: ${message}\n`);
    process.exit(1);
  });
}
