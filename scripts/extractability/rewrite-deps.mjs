#!/usr/bin/env node
/**
 * EX-2 helper — rewrite a copied unit's package.json for isolated install.
 *
 * Mutates ONLY where shared deps come from (the legal "extraction" mutation):
 *   - every `@pops/*: workspace:*` runtime dep  -> `file:<tarball>` from the manifest
 *   - any remaining `workspace:*` spec (e.g. a workspace devDep not packed) is
 *     dropped, so the isolated `pnpm install` does not fail resolving an
 *     unreachable workspace protocol. Dropping devDeps is safe: the sandbox
 *     proves the BUILD, and build/typecheck deps it actually needs are packed
 *     or external.
 *
 * Nothing else in the manifest changes — same source, same exports, same
 * external deps. If the unit's declared surface is incomplete, the isolated
 * install/build fails. That is the proof.
 *
 * Usage: node scripts/extractability/rewrite-deps.mjs <copied-package.json> <deps-manifest.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The root `allowBuilds` map, so the sandbox inherits the same install-script
 * allowlist the repo enforces.
 *
 * Without it pnpm 11 refuses the sandbox install outright
 * (`ERR_PNPM_IGNORED_BUILDS`) the moment the closure contains a package with a
 * build script — esbuild reaches most units. Copying rather than restating it
 * keeps one source of truth: an extracted repo would carry this policy too, so
 * the sandbox proving a build under a *different* allowlist would not be an
 * honest proof.
 *
 * Read with a real parser rather than matched line by line. The previous
 * reader anchored on `allowBuilds:` at exactly zero indent with nothing after
 * the colon, and returned `[]` — indistinguishable from "the root declares
 * none" — for the flow form, a trailing comment, a quoted key, a blank line
 * between entries, or a column-0 comment inside the block. The file is the
 * block form today, so that was latent; a formatter run was enough to trigger
 * it, and the failure mode is a sandbox proving a build under an allowlist the
 * workspace does not use.
 *
 * @param {string} [source] The workspace YAML. Defaults to the repo root's.
 * @returns {Record<string, unknown> | null} The map, or `null` if undeclared.
 * @throws if the file or the key is present in a shape this cannot use.
 */
export function rootAllowBuilds(
  source = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')
) {
  const doc = parseYaml(source);
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new Error('pnpm-workspace.yaml does not parse to a mapping');
  }
  /** @type {Record<string, unknown>} */
  const root = doc;
  if (!Object.hasOwn(root, 'allowBuilds')) return null;
  const allowBuilds = root.allowBuilds;
  if (typeof allowBuilds !== 'object' || allowBuilds === null || Array.isArray(allowBuilds)) {
    throw new Error(
      `pnpm-workspace.yaml declares allowBuilds as ${Array.isArray(allowBuilds) ? 'a sequence' : typeof allowBuilds}, ` +
        'not a mapping — the sandbox cannot inherit an allowlist it cannot read'
    );
  }
  return /** @type {Record<string, unknown>} */ (allowBuilds);
}

/**
 * The sandbox's own `pnpm-workspace.yaml`, emitted by the YAML writer rather
 * than concatenated.
 *
 * `packages: []` makes the sandbox its own workspace root, which is what
 * replaces the old `--ignore-workspace` flag — that flag would now ignore this
 * very file. The overrides pin every `@pops/*` edge, including the transitive
 * ones a packed dep declares as concrete versions, to the tarballs, so the
 * closure resolves entirely offline.
 *
 * Emitted rather than hand-written because a tarball path containing a quote
 * produced a broken workspace file, and the sandbox would then fail for a
 * reason that has nothing to do with the unit under test.
 *
 * @param {Record<string, string>} manifest Packed `@pops/*` name -> tarball path.
 * @param {Record<string, unknown> | null} allowBuilds
 * @returns {string}
 */
export function sandboxWorkspaceYaml(manifest, allowBuilds) {
  /** @type {Record<string, unknown>} */
  const doc = { packages: [] };
  if (allowBuilds !== null) doc.allowBuilds = allowBuilds;
  const packed = Object.entries(manifest);
  if (packed.length > 0) {
    doc.overrides = Object.fromEntries(packed.map(([name, tgz]) => [name, `file:${tgz}`]));
  }
  return stringifyYaml(doc);
}

/** @param {string[]} argv */
function main(argv) {
  const [pkgPath, manifestPath] = argv;
  if (!pkgPath || !manifestPath) {
    process.stderr.write('usage: rewrite-deps.mjs <package.json> <deps-manifest.json>\n');
    return 2;
  }
  /** @type {Record<string, unknown>} */
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  /** @type {Record<string, string>} */
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const field of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
    'devDependencies',
  ]) {
    const block = pkg[field];
    if (!block || typeof block !== 'object') continue;
    for (const [name, spec] of Object.entries(block)) {
      if (typeof spec !== 'string') continue;
      if (Object.prototype.hasOwnProperty.call(manifest, name)) {
        block[name] = `file:${manifest[name]}`;
      } else if (spec.startsWith('workspace:')) {
        delete block[name];
      }
    }
  }

  // peerDependencies on a packed @pops dep must also resolve from the tarball.
  const peers = pkg.peerDependencies;
  if (peers && typeof peers === 'object') {
    for (const [name] of Object.entries(peers)) {
      if (Object.prototype.hasOwnProperty.call(manifest, name)) {
        const deps =
          pkg.dependencies && typeof pkg.dependencies === 'object'
            ? pkg.dependencies
            : (pkg.dependencies = {});
        deps[name] = `file:${manifest[name]}`;
      }
    }
  }

  // Force the TRANSITIVE @pops/* edges to resolve from the packed tarballs too.
  // A packed dep's own manifest declares its @pops/* deps as concrete versions
  // (`@pops/types: 0.1.0` — pnpm pack froze the `workspace:*`), which an
  // isolated install would chase to the public registry and 404 on. An
  // `overrides` block keyed on each packed name pins the whole tree to the
  // tarballs, so the closure resolves entirely offline — the faithful stand-in
  // for "every @pops/* dep comes from a published artifact".
  //
  // The overrides go in a sandbox-local `pnpm-workspace.yaml`, not in
  // `pkg.pnpm.overrides`: pnpm 11 no longer reads the `pnpm` field and only
  // warns, so writing there would silently drop every pin and the sandbox
  // would fail resolving @pops/* from the registry. `packages: []` makes the
  // sandbox its own workspace root, which is what replaces the old
  // `--ignore-workspace` flag — that flag would now ignore this very file.
  const allowBuilds = rootAllowBuilds();
  if (Object.keys(manifest).length > 0 || allowBuilds !== null) {
    writeFileSync(
      pkgPath.replace(/package\.json$/, 'pnpm-workspace.yaml'),
      sandboxWorkspaceYaml(manifest, allowBuilds)
    );
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  process.stdout.write(
    `rewrote ${pkgPath} (${Object.keys(manifest).length} @pops dep(s) -> file:)\n`
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
