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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The root `allowBuilds` block, verbatim, so the sandbox inherits the same
 * install-script allowlist the repo enforces.
 *
 * Without it pnpm 11 refuses the sandbox install outright
 * (`ERR_PNPM_IGNORED_BUILDS`) the moment the closure contains a package with a
 * build script — esbuild reaches most units. Copying rather than restating it
 * keeps one source of truth: an extracted repo would carry this policy too, so
 * the sandbox proving a build under a *different* allowlist would not be an
 * honest proof.
 *
 * @returns {string[]} the block's lines, or `[]` if the root declares none
 */
function rootAllowBuilds() {
  const yaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const lines = yaml.split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === 'allowBuilds:');
  if (start === -1) return [];
  const out = ['allowBuilds:'];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    out.push(line.trimEnd());
  }
  return out;
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
  if (Object.keys(manifest).length > 0 || allowBuilds.length > 0) {
    const lines = ['packages: []'];
    if (allowBuilds.length > 0) lines.push('', ...allowBuilds);
    if (Object.keys(manifest).length > 0) {
      lines.push('', 'overrides:');
      for (const [name, tgz] of Object.entries(manifest)) {
        lines.push(`  '${name}': 'file:${tgz}'`);
      }
    }
    writeFileSync(
      pkgPath.replace(/package\.json$/, 'pnpm-workspace.yaml'),
      `${lines.join('\n')}\n`
    );
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  process.stdout.write(
    `rewrote ${pkgPath} (${Object.keys(manifest).length} @pops dep(s) -> file:)\n`
  );
  return 0;
}

process.exit(main(process.argv.slice(2)));
