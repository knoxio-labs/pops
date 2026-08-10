import { parse as parseToml } from 'smol-toml';
import { describe, expect, it } from 'vitest';

import { readWorkspaceManifest, rewriteManifest } from '../cargo-extract.mjs';

const ROOT = `[workspace]
resolver = "2"
members = ["pillars/contacts", "libs/pops-ai"]

[workspace.package]
edition = "2021"
license = "UNLICENSED"
publish = false

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal"] }
anyhow = "1"`;

const ROOT_SUB_TABLES = `[workspace]
resolver = "2"
members = ["pillars/contacts", "libs/pops-ai"]

[workspace.package]
edition = "2021"
license = "UNLICENSED"
publish = false

[workspace.dependencies.serde]
version = "1"
features = ["derive"]

[workspace.dependencies.tokio]
version = "1"
features = ["rt-multi-thread", "macros", "signal"]

[workspace.dependencies.anyhow]
version = "1"`;

describe('rewriteManifest', () => {
  it('inlines [workspace.package] inheritance', () => {
    const member = `[package]
name = "demo"
edition.workspace = true
license.workspace = true
publish.workspace = true`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('edition = "2021"');
    expect(out).toContain('license = "UNLICENSED"');
    expect(out).toContain('publish = false');
    expect(out).not.toContain('.workspace = true');
  });

  it('resolves a string-form workspace dep to its pinned version', () => {
    const member = `[package]
name = "demo"
[dependencies]
anyhow = { workspace = true }`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('anyhow = { version = "1" }');
  });

  it('resolves a table-form workspace dep preserving its features', () => {
    const member = `[package]
name = "demo"
[dependencies]
serde = { workspace = true }`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('serde = { version = "1", features = ["derive"] }');
  });

  it('unions member-local features onto the workspace base features', () => {
    const member = `[package]
name = "demo"
[dev-dependencies]
tokio = { workspace = true, features = ["test-util"] }`;
    const out = rewriteManifest(member, ROOT);
    const line = out.split('\n').find((l) => l.startsWith('tokio = '));
    expect(line).toBeDefined();
    for (const f of ['rt-multi-thread', 'macros', 'signal', 'test-util']) {
      expect(line).toContain(`"${f}"`);
    }
    expect(line).not.toContain('workspace = true');
  });

  it('drops the package→workspace pointer and roots the crate with [workspace]', () => {
    const member = `[package]
name = "demo"
workspace = "../.."
edition.workspace = true`;
    const out = rewriteManifest(member, ROOT);
    expect(out).not.toContain('workspace = "../.."');
    expect(out.trimEnd().endsWith('[workspace]')).toBe(true);
  });

  it('throws if a workspace=true dep is missing from [workspace.dependencies]', () => {
    const member = `[package]
name = "demo"
[dependencies]
ghost = { workspace = true }`;
    expect(() => rewriteManifest(member, ROOT)).toThrow(/ghost/u);
  });

  it('leaves a non-workspace pinned dep untouched', () => {
    const member = `[package]
name = "demo"
[dev-dependencies]
tower = { version = "0.5", features = ["util"] }`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('tower = { version = "0.5", features = ["util"] }');
  });

  it('throws if a workspace=true [package] field is missing from [workspace.package]', () => {
    const member = `[package]
name = "demo"
rust-version.workspace = true`;
    expect(() => rewriteManifest(member, ROOT)).toThrow(/rust-version/u);
  });

  it('still resolves a workspace dep under a target-scoped flat dependency table', () => {
    const member = `[package]
name = "demo"
[target.'cfg(unix)'.dependencies]
anyhow = { workspace = true }`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('anyhow = { version = "1" }');
  });
});

describe('readWorkspaceManifest', () => {
  it('reads [workspace.package] and [workspace.dependencies] written as flat tables', () => {
    const { package: pkg, dependencies } = readWorkspaceManifest(ROOT, 'Cargo.toml');
    expect(pkg).toEqual({ edition: '2021', license: 'UNLICENSED', publish: false });
    expect(dependencies.anyhow).toBe('1');
    expect(dependencies.serde).toEqual({ version: '1', features: ['derive'] });
  });

  it('reads the same tables written as [workspace.dependencies.<crate>] sub-tables', () => {
    const { package: pkg, dependencies } = readWorkspaceManifest(ROOT_SUB_TABLES, 'Cargo.toml');
    expect(pkg).toEqual({ edition: '2021', license: 'UNLICENSED', publish: false });
    expect(dependencies.anyhow).toEqual({ version: '1' });
    expect(dependencies.serde).toEqual({ version: '1', features: ['derive'] });
    expect(dependencies.tokio).toEqual({
      version: '1',
      features: ['rt-multi-thread', 'macros', 'signal'],
    });
  });
});

describe('rewriteManifest — [workspace.dependencies.<crate>] sub-table root', () => {
  it('resolves a flat member dependency against a root that spells deps as sub-tables', () => {
    const member = `[package]
name = "demo"
[dependencies]
serde = { workspace = true }`;
    const out = rewriteManifest(member, ROOT_SUB_TABLES);
    expect(out).toContain('serde = { version = "1", features = ["derive"] }');
  });
});

describe('rewriteManifest — [dependencies.<crate>] sub-table member', () => {
  it('resolves a workspace dependency declared only as its own sub-table', () => {
    const member = `[package]
name = "demo"
[dependencies.serde]
workspace = true`;
    const out = rewriteManifest(member, ROOT);
    expect(out).not.toContain('workspace = true');
    expect(out).toContain('[dependencies]');
    expect(out).toContain('serde = { version = "1", features = ["derive"] }');
  });

  it('merges a sub-table-local feature override onto the workspace base features', () => {
    const member = `[package]
name = "demo"
[dependencies.tokio]
workspace = true
features = ["test-util"]`;
    const out = rewriteManifest(member, ROOT);
    const line = out.split('\n').find((l) => l.startsWith('tokio = '));
    expect(line).toBeDefined();
    for (const f of ['rt-multi-thread', 'macros', 'signal', 'test-util']) {
      expect(line).toContain(`"${f}"`);
    }
  });

  it('leaves a fully concrete sub-table dependency untouched, byte for byte', () => {
    const member = `[package]
name = "demo"
[dependencies.contacts]
path = "../../pillars/contacts"`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain('[dependencies.contacts]');
    expect(out).toContain('path = "../../pillars/contacts"');
  });

  it('resolves both a root sub-table and a member sub-table together', () => {
    const member = `[package]
name = "demo"
[dependencies.serde]
workspace = true`;
    const out = rewriteManifest(member, ROOT_SUB_TABLES);
    expect(out).toContain('serde = { version = "1", features = ["derive"] }');
    expect(out).not.toContain('workspace = true');
  });

  it('splices a resolved sub-table dependency into an existing flat [dependencies] table rather than duplicating the header', () => {
    const member = `[package]
name = "demo"
[dependencies]
tower = { version = "0.5" }

[dependencies.serde]
workspace = true
features = ["rc"]

[dependencies.tokio]
workspace = true`;
    const out = rewriteManifest(member, ROOT);
    const headerCount = out.split('\n').filter((l) => l.trim() === '[dependencies]').length;
    expect(headerCount).toBe(1);

    const parsed = parseToml(out) as {
      dependencies: Record<string, unknown>;
    };
    expect(parsed.dependencies.tower).toEqual({ version: '0.5' });
    expect(parsed.dependencies.serde).toEqual({
      version: '1',
      features: expect.arrayContaining(['derive', 'rc']),
    });
    expect(parsed.dependencies.tokio).toEqual({
      version: '1',
      features: ['rt-multi-thread', 'macros', 'signal'],
    });
  });

  it('throws if a sub-table workspace=true dep is missing from [workspace.dependencies]', () => {
    const member = `[package]
name = "demo"
[dependencies.ghost]
workspace = true`;
    expect(() => rewriteManifest(member, ROOT)).toThrow(/ghost/u);
  });

  it('does not relocate an unmodeled target-scoped per-crate sub-table', () => {
    const member = `[package]
name = "demo"
[target.'cfg(unix)'.dependencies.nix]
version = "0.27"`;
    const out = rewriteManifest(member, ROOT);
    expect(out).toContain(`[target.'cfg(unix)'.dependencies.nix]`);
    expect(out).toContain('version = "0.27"');
  });

  it('stops a sub-table body scan at a following [[array-of-tables]] header instead of absorbing it', () => {
    // Real shape: pillars/contacts/Cargo.toml has two [[bin]] tables. A body
    // scan that only recognises `[table]` as a boundary would run straight
    // past `[[bin]]` (it does not match that pattern) and keep consuming
    // lines as if they still belonged to the dependency sub-table.
    const member = `[package]
name = "demo"

[lib]
name = "demo"
path = "src/lib.rs"

[dependencies.serde]
workspace = true

[[bin]]
name = "demo"
path = "src/main.rs"

[[bin]]
name = "emit-openapi"
path = "src/bin/emit_openapi.rs"`;
    const out = rewriteManifest(member, ROOT);
    const parsed = parseToml(out) as {
      dependencies: Record<string, unknown>;
      bin: Array<Record<string, unknown>>;
    };
    expect(parsed.dependencies.serde).toEqual({ version: '1', features: ['derive'] });
    expect(parsed.bin).toEqual([
      { name: 'demo', path: 'src/main.rs' },
      { name: 'emit-openapi', path: 'src/bin/emit_openapi.rs' },
    ]);
  });

  it('does not let a preceding [[array-of-tables]] section leak stale [package] tracking', () => {
    const member = `[package]
name = "demo"
edition.workspace = true

[[bin]]
name = "demo"
path = "src/main.rs"

[dependencies]
serde = { workspace = true }`;
    const out = rewriteManifest(member, ROOT);
    const parsed = parseToml(out) as {
      package: Record<string, unknown>;
      bin: Array<Record<string, unknown>>;
      dependencies: Record<string, unknown>;
    };
    expect(parsed.package.edition).toBe('2021');
    expect(parsed.bin).toEqual([{ name: 'demo', path: 'src/main.rs' }]);
    expect(parsed.dependencies.serde).toEqual({ version: '1', features: ['derive'] });
  });
});

describe('rewriteManifest — parse-failure labels', () => {
  it('attributes a bad root parse to the root label, not the member label', () => {
    expect(() =>
      rewriteManifest(
        '[package]\nname = "demo"',
        '[workspace\nmembers = ["x"]',
        'ROOT_LABEL.toml',
        'MEMBER_LABEL.toml'
      )
    ).toThrow(/ROOT_LABEL\.toml/u);
  });

  it('attributes a bad member sub-table parse to the member label, not the root label', () => {
    const member = `[package]
name = "demo"
[dependencies.serde]
workspace = true
features = [`;
    expect(() => rewriteManifest(member, ROOT, 'ROOT_LABEL.toml', 'MEMBER_LABEL.toml')).toThrow(
      /MEMBER_LABEL\.toml/u
    );
  });
});
