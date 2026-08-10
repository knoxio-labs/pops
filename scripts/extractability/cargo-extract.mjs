#!/usr/bin/env node
/**
 * cargo-extract — materialize a single workspace member crate as a standalone,
 * workspace-free package in an output dir, ready to `cargo build` in isolation.
 * The cargo analogue of the TS `rewrite-deps.mjs` step, so the Rust members
 * face the same extract-to-own-repo litmus as the TS units (ADR-039).
 *
 * The single mutation it performs — the "changing only where shared deps come
 * from" clause — is to break every workspace inheritance edge:
 *
 *   1. `[workspace.package]` inheritance (`edition.workspace = true`,
 *      `license.workspace = true`, `publish.workspace = true`, …) is inlined
 *      from the workspace root's `[workspace.package]`.
 *   2. `[workspace.dependencies]` inheritance (`dep = { workspace = true }`) is
 *      replaced with the dep's concrete spec from the root
 *      `[workspace.dependencies]`, merging any member-local `features`/
 *      `optional`/`default-features` overrides on top.
 *   3. The member's `workspace = "../.."` package pointer (if present) is
 *      dropped, and an empty `[workspace]` table is appended so the extracted
 *      crate is its own root and does not climb back to the parent workspace.
 *
 * Everything else is copied verbatim, byte-for-byte. If the crate builds after
 * this — with no workspace path resolution available — it is extraction-ready.
 *
 * The root manifest is read through `smol-toml` (see `parseToml` in
 * `scripts/ci/config-parse.mjs`), so `[workspace.package]` and
 * `[workspace.dependencies]` are read correctly regardless of which legal
 * spelling they use — `key = value` inside the table, or the table's own
 * `[workspace.dependencies.<crate>]` sub-table (ADR-045). The member manifest
 * is still rewritten line-by-line rather than parsed and re-serialised: a
 * parse/print round trip through the member would reformat the whole file and
 * drop comments and key order, which is worse than the targeted line rewrite.
 * A member-side dependency written as its own `[dependencies.<crate>]`
 * sub-table is still recognised and resolved — the surrounding block is
 * replaced by a single generated line — the fix is scoped to how the tool
 * reads a table, not to abandoning the line-based write.
 *
 * This tool is not one of the guard jobs the ADR-045 tier amendment sorts into
 * Tier A/B: it runs inside `cargo-sandbox.sh`, the nightly / on-demand EX-2
 * check, never inside a per-PR guard job. Every invocation happens against an
 * already-installed workspace — the same assumption `lib.mjs` in this
 * directory already makes by importing `typescript` — so importing a parser
 * here does not risk a `MODULE_NOT_FOUND` in a required check the way it would
 * in a Tier A guard.
 *
 * Usage:
 *   node scripts/extractability/cargo-extract.mjs <member-dir> <out-dir>
 *   node scripts/extractability/cargo-extract.mjs libs/pops-ai /tmp/crate-out
 *   node scripts/extractability/cargo-extract.mjs --self-test
 *
 * Exit 0 on success; exit 1 on a failed self-test; exit 2 on usage / parse
 * error.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigParseError, isMapping, parseToml } from '../ci/config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Dependency tables a `{ workspace = true }` entry can appear under. */
const DEP_TABLES = ['dependencies', 'dev-dependencies', 'build-dependencies'];

/**
 * Strip a `#` comment outside any string. (Member manifests do not embed `#`
 * inside the values this tool reads.)
 *
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let inStr = false;
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inStr) {
      if (ch === quote) inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
    } else if (ch === '#') return line.slice(0, i);
  }
  return line;
}

/**
 * Render a parsed TOML value back to inline TOML syntax, for splicing a value
 * read from the root manifest into the line-based member rewrite.
 *
 * @param {unknown} value
 * @returns {string}
 */
function tomlValueText(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlValueText).join(', ')}]`;
  throw new Error(`cannot render a TOML value of type ${typeof value} inline`);
}

/**
 * Classify a table header path against the dependency tables. Cargo accepts a
 * dependency both as an entry inside its table (`[dependencies]` /
 * `serde = {…}`) and as the entry's own sub-table (`[dependencies.serde]` /
 * `version = "…"` as its body). Both spellings resolve to the same
 * dependency and must be recognised the same way; a reader that only models
 * the first is the sub-table blindness ADR-045 names.
 *
 * A `[target.<cfg>.dependencies]` header is still recognised as the table
 * itself (`crate: null`), matching the existing flat-entry handling below.
 * A target-scoped PER-CRATE sub-table (`[target.<cfg>.dependencies.<crate>]`)
 * is deliberately not modelled here: relocating it into a plain `[<table>]`
 * the way the plain sub-table case is relocated would silently drop its cfg
 * gate, which is worse than leaving it unresolved. It falls through as an
 * unrecognised section, same as before this file read TOML at all.
 *
 * @param {string} section  Header path with the brackets stripped, e.g.
 *   `dependencies`, `dependencies.serde`, `target.'cfg(unix)'.dependencies`.
 * @returns {{ table: string; crate: string | null } | null} `null` if
 *   `section` is not a (plain, non-target-scoped-per-crate) dependency table;
 *   otherwise the canonical table name and, for a per-crate sub-table, the
 *   crate name.
 */
function depTableKind(section) {
  for (const table of DEP_TABLES) {
    if (section === table || section.endsWith(`.${table}`)) return { table, crate: null };
  }
  const dot = section.indexOf('.');
  if (dot === -1) return null;
  const head = section.slice(0, dot);
  const rest = section.slice(dot + 1);
  if (DEP_TABLES.includes(head) && rest.length > 0 && !rest.includes('.')) {
    return { table: head, crate: rest };
  }
  return null;
}

/**
 * Cheap pre-filter over a dependency sub-table's raw body lines: does any line
 * assign `workspace = true`, ignoring comments? Only when this is true do we
 * commit to parsing the block — an ordinary, fully-concrete sub-table
 * dependency (the common case) is left untouched, byte for byte, with no
 * parse attempted and therefore no new way for this tool to reject a manifest
 * it used to copy straight through.
 *
 * @param {string[]} bodyLines  Raw (unstripped) lines between the header and
 *   the next header or EOF.
 * @returns {boolean}
 */
function mentionsWorkspaceTrue(bodyLines) {
  return bodyLines.some((line) => /\bworkspace\s*=\s*true\b/u.test(stripComment(line)));
}

/**
 * Serialize a concrete dependency spec to a single TOML line, merging the
 * workspace base spec with member-local overrides (the member's `features` are
 * unioned with the workspace base features; other override keys win).
 *
 * @param {string} name
 * @param {unknown} workspaceSpec  Parsed RHS of the workspace dep — a plain
 *   string version, or a table of fields.
 * @param {Record<string, unknown>} memberOverrides  Parsed member-local fields,
 *   minus `workspace`.
 * @returns {string}
 */
function mergeDepLine(name, workspaceSpec, memberOverrides) {
  const base =
    typeof workspaceSpec === 'string' ? { version: workspaceSpec } : { ...workspaceSpec };
  const merged = { ...base };
  for (const [key, value] of Object.entries(memberOverrides)) {
    if (key === 'features' && Array.isArray(base.features)) {
      merged.features = [
        ...new Set([...base.features, ...(Array.isArray(value) ? value : [value])]),
      ];
    } else {
      merged[key] = value;
    }
  }
  const parts = Object.entries(merged).map(([key, value]) => `${key} = ${tomlValueText(value)}`);
  return `${name} = { ${parts.join(', ')} }`;
}

/**
 * Parse the workspace root manifest into its `[workspace.package]` and
 * `[workspace.dependencies]` tables. Both come back as plain objects
 * regardless of which legal spelling declared their entries — `smol-toml`
 * collapses `[workspace.dependencies]` / `serde = {…}` and
 * `[workspace.dependencies.serde]` / `version = "…"` into the same shape, so
 * nothing downstream needs to know which one the file used. A root that fails
 * to parse raises rather than yielding empty tables — an inheritance the
 * member actually needs then reports "absent" for the true reason (an
 * unreadable root) instead of the misleading one (a root with nothing in it).
 *
 * @param {string} rootToml
 * @param {string} label  Path used in a parse-failure message.
 * @returns {{ package: Record<string, unknown>; dependencies: Record<string, unknown> }}
 * @throws {ConfigParseError}
 */
export function readWorkspaceManifest(rootToml, label) {
  const doc = parseToml(rootToml, label);
  const workspace = doc.workspace;
  if (!isMapping(workspace)) {
    throw new ConfigParseError(label, 'declares no [workspace] table');
  }
  const pkg = workspace.package;
  const deps = workspace.dependencies;
  return {
    package: isMapping(pkg) ? pkg : {},
    dependencies: isMapping(deps) ? deps : {},
  };
}

/**
 * Rewrite a member Cargo.toml to a standalone manifest: inline
 * `[workspace.package]` inheritance, resolve `{ workspace = true }` deps from
 * the root `[workspace.dependencies]`, drop the `workspace = "…"` pointer, and
 * append an empty `[workspace]` so the crate roots itself.
 *
 * Everything not touched by one of those three rules is copied verbatim,
 * including a dependency's own `[dependencies.<crate>]` sub-table that is
 * fully concrete already — the rewrite only opens that block when it contains
 * `workspace = true`.
 *
 * A resolved sub-table dependency cannot simply be replaced in place by its
 * generated `name = { … }` line: removing its header hands that line to
 * whichever table happened to still be open at that point in the file (the
 * previous header, verbatim, if any — `[package]` in the degenerate case of a
 * member with no flat `[dependencies]` at all), which is a different table
 * than the one the dependency actually belongs to. Resolved sub-table
 * entries are instead collected and spliced into an existing flat `[<table>]`
 * header if the member has one, or appended in a fresh one otherwise —
 * always a placement that is valid regardless of what surrounds it.
 *
 * @param {string} memberToml  Member manifest text.
 * @param {string} rootToml    Workspace-root manifest text.
 * @param {string} [label]     Path used in a parse-failure message.
 * @returns {string}
 * @throws {ConfigParseError | Error}
 */
export function rewriteManifest(memberToml, rootToml, label = 'Cargo.toml') {
  const { package: wsPackage, dependencies: wsDeps } = readWorkspaceManifest(rootToml, label);

  const lines = memberToml.split('\n');
  /** @type {string[]} */
  const out = [];
  /** @type {Record<string, string[]>} Resolved sub-table deps awaiting placement, by table. */
  const pendingByTable = {};
  let section = '';

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const codeOnly = stripComment(raw);
    const header = codeOnly.trim().match(/^\[([^\]]+)\]$/u);

    if (header) {
      section = header[1];
      const info = depTableKind(section);
      if (info && info.crate !== null) {
        const name = info.crate;
        const bodyRaw = [];
        let j = i + 1;
        while (
          j < lines.length &&
          !stripComment(lines[j])
            .trim()
            .match(/^\[([^\]]+)\]$/u)
        ) {
          bodyRaw.push(lines[j]);
          j += 1;
        }
        if (mentionsWorkspaceTrue(bodyRaw)) {
          const fields = parseToml(bodyRaw.join('\n'), `${label}: [${section}]`);
          if (fields.workspace !== true) {
            throw new Error(
              `[${section}] matched 'workspace = true' textually but did not parse to it`
            );
          }
          const wsSpec = wsDeps[name];
          if (wsSpec === undefined) {
            throw new Error(
              `'${name}' is { workspace = true } but absent from [workspace.dependencies]`
            );
          }
          const overrides = { ...fields };
          delete overrides.workspace;
          (pendingByTable[info.table] ??= []).push(mergeDepLine(name, wsSpec, overrides));
        } else {
          out.push(raw, ...bodyRaw);
        }
        i = j;
        continue;
      }
      out.push(raw);
      i += 1;
      continue;
    }

    if (section === 'package') {
      const inherit = codeOnly.trim().match(/^([A-Za-z0-9_-]+)\.workspace\s*=\s*true\b/u);
      if (inherit) {
        const field = inherit[1];
        if (!(field in wsPackage)) {
          throw new Error(
            `'${field}' is { workspace = true } in [package] but absent from [workspace.package]`
          );
        }
        out.push(`${field} = ${tomlValueText(wsPackage[field])}`);
        i += 1;
        continue;
      }
      if (/^workspace\s*=/u.test(codeOnly.trim())) {
        i += 1;
        continue; // drop the package→workspace pointer
      }
      out.push(raw);
      i += 1;
      continue;
    }

    const flat = depTableKind(section);
    if (flat && flat.crate === null) {
      const m = codeOnly.trim().match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/u);
      if (m && /\bworkspace\s*=\s*true\b/u.test(m[2])) {
        const name = m[1];
        const wsSpec = wsDeps[name];
        if (wsSpec === undefined) {
          throw new Error(
            `'${name}' is { workspace = true } but absent from [workspace.dependencies]`
          );
        }
        const value = parseToml(`v = ${m[2].trim()}`, `${label}: ${name}`).v;
        if (!isMapping(value)) {
          throw new Error(
            `'${name} = ${m[2].trim()}' matched 'workspace = true' textually but did not parse to a table`
          );
        }
        const overrides = { ...value };
        delete overrides.workspace;
        out.push(mergeDepLine(name, wsSpec, overrides));
        i += 1;
        continue;
      }
      out.push(raw);
      i += 1;
      continue;
    }

    out.push(raw);
    i += 1;
  }

  for (const [table, resolvedLines] of Object.entries(pendingByTable)) {
    const headerIndex = out.findIndex((line) => stripComment(line).trim() === `[${table}]`);
    if (headerIndex === -1) {
      out.push(`[${table}]`, ...resolvedLines);
    } else {
      out.splice(headerIndex + 1, 0, ...resolvedLines);
    }
  }

  out.push(
    '',
    '# Inserted by cargo-extract.mjs: root the crate so it does not',
    '# climb to the parent workspace during isolated build.',
    '[workspace]'
  );
  return `${out.join('\n').replace(/\n+$/u, '')}\n`;
}

/**
 * Self-test: prove the extractor resolves a workspace dependency and a
 * workspace package field no matter which legal spelling declared them, on
 * either side of the root/member boundary, and that an inheritance nothing can
 * resolve throws instead of materialising the raw `workspace = true` token
 * into a crate that will not build. Mirrors the `--self-test` convention in
 * `check-cargo-deps.mjs`.
 *
 * @returns {boolean}
 */
function selfTest() {
  const flatRoot = `[workspace]
members = ["libs/demo"]

[workspace.package]
edition = "2021"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
anyhow = "1"`;

  const subTableRoot = `[workspace]
members = ["libs/demo"]

[workspace.package]
edition = "2021"

[workspace.dependencies.serde]
version = "1"
features = ["derive"]

[workspace.dependencies.anyhow]
version = "1"`;

  const flatMember = `[package]
name = "demo"
edition.workspace = true

[dependencies]
serde = { workspace = true }`;

  const subTableMember = `[package]
name = "demo"
edition.workspace = true

[dependencies.serde]
workspace = true`;

  const resolved = 'serde = { version = "1", features = ["derive"] }';

  const resolvesFlat = rewriteManifest(flatMember, flatRoot).includes(resolved);
  const resolvesRootSubTable = rewriteManifest(flatMember, subTableRoot).includes(resolved);
  const memberSubTableOut = rewriteManifest(subTableMember, flatRoot);
  const resolvesMemberSubTable =
    memberSubTableOut.includes(resolved) && !memberSubTableOut.includes('workspace = true');
  const resolvesBothSubTable = rewriteManifest(subTableMember, subTableRoot).includes(resolved);

  const throws = (member, root) => {
    try {
      rewriteManifest(member, root);
      return false;
    } catch (error) {
      return error instanceof Error;
    }
  };

  const missingDepThrows = throws(
    '[package]\nname = "demo"\n[dependencies]\nghost = { workspace = true }',
    flatRoot
  );
  const missingDepSubTableThrows = throws(
    '[package]\nname = "demo"\n[dependencies.ghost]\nworkspace = true',
    flatRoot
  );
  const missingPackageFieldThrows = throws(
    '[package]\nname = "demo"\nrust-version.workspace = true',
    flatRoot
  );

  let unparseableRootThrows = false;
  try {
    rewriteManifest(flatMember, '[workspace\nmembers = ["x"]');
  } catch (error) {
    unparseableRootThrows = error instanceof ConfigParseError;
  }

  const ok =
    resolvesFlat &&
    resolvesRootSubTable &&
    resolvesMemberSubTable &&
    resolvesBothSubTable &&
    missingDepThrows &&
    missingDepSubTableThrows &&
    missingPackageFieldThrows &&
    unparseableRootThrows;

  if (!ok) {
    console.error('SELF-TEST FAILED — extractor did not behave as expected:');
    console.error(`  resolves flat 'dep = { workspace = true }':         ${resolvesFlat}`);
    console.error(`  resolves root [workspace.dependencies.<crate>]:     ${resolvesRootSubTable}`);
    console.error(
      `  resolves member [dependencies.<crate>] sub-table:   ${resolvesMemberSubTable}`
    );
    console.error(`  resolves both sides spelled as sub-tables:          ${resolvesBothSubTable}`);
    console.error(`  throws on a dep missing from workspace deps:        ${missingDepThrows}`);
    console.error(
      `  throws on a sub-table dep missing from workspace:   ${missingDepSubTableThrows}`
    );
    console.error(
      `  throws on an unresolvable [package] field:          ${missingPackageFieldThrows}`
    );
    console.error(`  throws on an unparseable workspace root:            ${unparseableRootThrows}`);
  } else {
    console.log(
      'self-test OK — resolves a workspace dependency and a workspace package field however ' +
        'either side spells them, and refuses to silently materialise an inheritance it cannot resolve.'
    );
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/extractability/cargo-extract.mjs <member-dir> <out-dir>\n' +
        '       node scripts/extractability/cargo-extract.mjs --self-test'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const [member, outDir] = args;
  if (!member || !outDir) {
    console.error('Usage: node scripts/extractability/cargo-extract.mjs <member-dir> <out-dir>');
    process.exit(2);
  }
  const memberAbs = resolve(repoRoot, member);
  const memberToml = join(memberAbs, 'Cargo.toml');
  const rootToml = join(repoRoot, 'Cargo.toml');
  if (!existsSync(memberToml)) {
    console.error(`no Cargo.toml at ${memberToml}`);
    process.exit(2);
  }

  const out = resolve(outDir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(memberAbs, out, {
    recursive: true,
    filter: (src) => !/(^|\/)(target|node_modules)(\/|$)/u.test(src),
  });

  let rewritten;
  try {
    rewritten = rewriteManifest(
      readFileSync(memberToml, 'utf8'),
      readFileSync(rootToml, 'utf8'),
      rootToml
    );
  } catch (err) {
    console.error(`cargo-extract: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  }
  writeFileSync(join(out, 'Cargo.toml'), rewritten);
  console.log(`cargo-extract: ${member} -> ${out} (workspace edges inlined)`);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
