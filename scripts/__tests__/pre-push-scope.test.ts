/**
 * The pre-push scoping decision.
 *
 * The asymmetry is the whole design and therefore most of this suite: a wrong
 * `skip` puts a type error on the remote, a wrong `run` costs ninety seconds.
 * So the interesting cases are not "does it skip a Swift push" — that is one
 * test — but every way a malformed manifest, an unrecognised path shape or a
 * failed git call could be mistaken for permission to skip.
 */

import { describe, expect, it } from 'vitest';

import {
  cargoWorkspaceMembers,
  decide,
  globRoot,
  isInsideWorkspace,
  parseRefUpdates,
  pnpmWorkspaceGlobs,
  workspaceRoots,
} from '../pre-push-scope.mjs';

/** This repo's real manifests, in the shape the parsers must handle. */
const PNPM_YAML = [
  'packages:',
  "  - 'pillars/*'",
  "  - 'pillars/*/*'",
  "  - 'libs/*'",
  '',
  '# a comment between blocks',
  'allowBuilds:',
  '  better-sqlite3: true',
  '',
  'engineStrict: true',
].join('\n');

const CARGO_TOML = [
  '# POPS Cargo workspace root',
  '[workspace]',
  'resolver = "2"',
  'members = ["pillars/contacts", "libs/pops-ai", "libs/pops-settings"]',
  '',
  '[workspace.package]',
  'edition = "2021"',
  '',
  '[workspace.dependencies]',
  'sqlx = { version = "0.9" }',
].join('\n');

const scope = workspaceRoots(PNPM_YAML, CARGO_TOML);

describe('pnpmWorkspaceGlobs', () => {
  it('reads every glob in the packages sequence', () => {
    expect(pnpmWorkspaceGlobs(PNPM_YAML)).toEqual(['pillars/*', 'pillars/*/*', 'libs/*']);
  });

  it('stops at the next top-level key rather than swallowing the rest of the file', () => {
    expect(pnpmWorkspaceGlobs(PNPM_YAML)).not.toContain('better-sqlite3: true');
  });

  it('accepts double quotes and bare scalars', () => {
    const yaml = 'packages:\n  - "a/*"\n  - b/*\n';
    expect(pnpmWorkspaceGlobs(yaml)).toEqual(['a/*', 'b/*']);
  });

  it('strips a trailing comment from a bare scalar', () => {
    expect(pnpmWorkspaceGlobs('packages:\n  - libs/*  # the shared libraries\n')).toEqual([
      'libs/*',
    ]);
  });

  it('keeps a quoted value intact even when it contains a hash', () => {
    expect(pnpmWorkspaceGlobs("packages:\n  - 'weird#dir/*'\n")).toEqual(['weird#dir/*']);
  });

  it('skips blank lines and comments inside the sequence', () => {
    const yaml = 'packages:\n  # first\n\n  - libs/*\n\n  # second\n  - pillars/*\n';
    expect(pnpmWorkspaceGlobs(yaml)).toEqual(['libs/*', 'pillars/*']);
  });

  it('returns nothing when there is no packages key at all', () => {
    expect(pnpmWorkspaceGlobs('engineStrict: true\n')).toEqual([]);
  });

  it('does not read a nested packages: key as the workspace one', () => {
    // Indented, so it belongs to some other mapping. Reading it would widen the
    // workspace to whatever that unrelated block happens to list.
    expect(pnpmWorkspaceGlobs('catalog:\n  packages:\n    - nonsense/*\n')).toEqual([]);
  });
});

describe('cargoWorkspaceMembers', () => {
  it('reads the single-line members array', () => {
    expect(cargoWorkspaceMembers(CARGO_TOML)).toEqual([
      'pillars/contacts',
      'libs/pops-ai',
      'libs/pops-settings',
    ]);
  });

  it('reads a multi-line members array whole', () => {
    const toml = '[workspace]\nmembers = [\n  "a/one",\n  "b/two",\n]\n';
    expect(cargoWorkspaceMembers(toml)).toEqual(['a/one', 'b/two']);
  });

  it('ignores a members key belonging to another table', () => {
    const toml = '[package]\nmembers = ["not/a/workspace/member"]\n';
    expect(cargoWorkspaceMembers(toml)).toEqual([]);
  });

  it('does not read [workspace.package] as [workspace]', () => {
    // The sub-table is a different table. Treating a dotted header as the
    // parent would let an unrelated key widen the workspace.
    const toml = '[workspace.package]\nmembers = ["nope"]\n';
    expect(cargoWorkspaceMembers(toml)).toEqual([]);
  });

  it('returns nothing for a manifest with no workspace table', () => {
    expect(cargoWorkspaceMembers('[package]\nname = "solo"\n')).toEqual([]);
  });
});

describe('globRoot', () => {
  it('reduces a glob to its fixed leading segment', () => {
    expect(globRoot('pillars/*')).toBe('pillars');
    expect(globRoot('pillars/*/*')).toBe('pillars');
    expect(globRoot('libs/pops-ai')).toBe('libs');
  });

  it('refuses a glob whose first segment is itself a wildcard', () => {
    // `*/app` can match any top-level directory, so there is no root to narrow
    // to and the caller must widen instead of picking one.
    expect(globRoot('*/app')).toBeUndefined();
    expect(globRoot('**')).toBeUndefined();
  });

  it('refuses a relative traversal', () => {
    expect(globRoot('../elsewhere')).toBeUndefined();
    expect(globRoot('.')).toBeUndefined();
  });

  it('sees through a leading ./', () => {
    expect(globRoot('./libs/*')).toBe('libs');
  });
});

describe('workspaceRoots', () => {
  it('derives the roots this repo actually has', () => {
    expect([...scope.roots].toSorted()).toEqual(['libs', 'pillars', 'scripts']);
    expect(scope.everything).toBe(false);
  });

  it('never treats clients/ as inside — the whole point of ADR-043', () => {
    expect(scope.roots.has('clients')).toBe(false);
  });

  it('widens to everything when pnpm-workspace.yaml cannot be read', () => {
    expect(workspaceRoots(undefined, CARGO_TOML).everything).toBe(true);
  });

  it('widens to everything when pnpm-workspace.yaml declares no packages', () => {
    // An empty workspace is far more likely to mean "the parser broke" than
    // "there are no packages", and the two are indistinguishable from here.
    expect(workspaceRoots('engineStrict: true\n', CARGO_TOML).everything).toBe(true);
  });

  it('widens to everything on a glob with no fixed root', () => {
    expect(workspaceRoots("packages:\n  - '*/app'\n", CARGO_TOML).everything).toBe(true);
  });

  it('does not widen merely because there is no Cargo.toml', () => {
    // A repo with no Rust is a normal repo, not a broken one.
    const noRust = workspaceRoots(PNPM_YAML, undefined);
    expect(noRust.everything).toBe(false);
    expect([...noRust.roots].toSorted()).toEqual(['libs', 'pillars', 'scripts']);
  });

  it('folds cargo members into the roots even when pnpm does not name them', () => {
    const cargoOnly = workspaceRoots(
      "packages:\n  - 'libs/*'\n",
      '[workspace]\nmembers = ["crates/one"]\n'
    );
    expect(cargoOnly.roots.has('crates')).toBe(true);
  });
});

describe('isInsideWorkspace', () => {
  it('places workspace paths inside', () => {
    expect(isInsideWorkspace('libs/ui/src/components/QrCode.tsx', scope)).toBe(true);
    expect(isInsideWorkspace('pillars/finance/src/index.ts', scope)).toBe(true);
    expect(isInsideWorkspace('pillars/food/app/src/main.tsx', scope)).toBe(true);
    expect(isInsideWorkspace('scripts/ci/check-node-pin.mjs', scope)).toBe(true);
  });

  it('places every root-level file inside, whatever it is', () => {
    for (const file of ['pnpm-lock.yaml', 'tsconfig.base.json', 'package.json', 'mise.toml']) {
      expect(isInsideWorkspace(file, scope), file).toBe(true);
    }
  });

  it('places the iOS client outside', () => {
    expect(isInsideWorkspace('clients/ios/App/PopsApp.swift', scope)).toBe(false);
    expect(isInsideWorkspace('clients/ios/mise.toml', scope)).toBe(false);
  });

  it('places docs, infra and workflow files outside', () => {
    expect(isInsideWorkspace('docs/architecture/adr-043-clients.md', scope)).toBe(false);
    expect(isInsideWorkspace('infra/docker-compose.dev.yml', scope)).toBe(false);
    expect(isInsideWorkspace('.github/workflows/ios-quality.yml', scope)).toBe(false);
  });

  it('places a directory that merely starts with a root name outside', () => {
    // `libsomething/` is not `libs/`. A prefix match rather than a segment
    // match would quietly widen the workspace to it.
    expect(isInsideWorkspace('libsomething/x.ts', scope)).toBe(false);
    expect(isInsideWorkspace('pillars-old/x.ts', scope)).toBe(false);
  });

  it('places everything inside once the scope has widened', () => {
    const widened = workspaceRoots(undefined, undefined);
    expect(isInsideWorkspace('clients/ios/App/PopsApp.swift', widened)).toBe(true);
  });
});

describe('decide', () => {
  const swiftOnly = [
    'clients/ios/App/PopsApp.swift',
    'clients/ios/Packages/AppCore/Sources/AppCore/Router.swift',
  ];

  it('skips a push confined to the iOS client', () => {
    expect(decide(swiftOnly, scope).verdict).toBe('skip');
  });

  it('skips a docs-only push', () => {
    expect(decide(['docs/architecture/adr-045.md'], scope).verdict).toBe('skip');
  });

  it('runs on a root-level README, because root-level is config until proven otherwise', () => {
    expect(decide(['docs/architecture/adr-045.md', 'README.md'], scope).verdict).toBe('run');
  });

  it('runs when a single workspace path is mixed in', () => {
    expect(decide([...swiftOnly, 'libs/ui/src/index.ts'], scope).verdict).toBe('run');
  });

  it('runs when the lockfile moved, even alongside only-Swift changes', () => {
    expect(decide([...swiftOnly, 'pnpm-lock.yaml'], scope).verdict).toBe('run');
  });

  it('runs when the diff could not be read', () => {
    // The single most important case in this file: an unreadable diff is not
    // evidence of anything, and must never be read as permission to skip.
    expect(decide(undefined, scope).verdict).toBe('run');
  });

  it('runs a Swift-only push when the manifests could not be parsed', () => {
    expect(decide(swiftOnly, workspaceRoots(undefined, undefined)).verdict).toBe('run');
  });

  it('skips a push that adds no changed paths at all', () => {
    expect(decide([], scope).verdict).toBe('skip');
  });

  it('names the paths that forced its verdict', () => {
    const ran = decide([...swiftOnly, 'libs/ui/src/index.ts'], scope);
    expect(ran.examples).toEqual(['libs/ui/src/index.ts']);
    const skipped = decide(swiftOnly, scope);
    expect(skipped.examples).toEqual(swiftOnly);
  });

  it('reports at most three examples so the hook stays readable', () => {
    const many = Array.from({ length: 40 }, (_, i) => `clients/ios/File${i}.swift`);
    expect(decide(many, scope).examples).toHaveLength(3);
  });
});

describe('parseRefUpdates', () => {
  it('parses git pre-push lines into local/remote SHA pairs', () => {
    const stdin = [
      'refs/heads/feat local1 refs/heads/feat remote1',
      'refs/heads/other local2 refs/heads/other remote2',
    ].join('\n');
    expect(parseRefUpdates(stdin)).toEqual([
      { localSha: 'local1', remoteSha: 'remote1' },
      { localSha: 'local2', remoteSha: 'remote2' },
    ]);
  });

  it('ignores blank and malformed lines rather than inventing a SHA', () => {
    expect(parseRefUpdates('\n\ngarbage\nrefs/heads/x a refs/heads/x b\n')).toEqual([
      { localSha: 'a', remoteSha: 'b' },
    ]);
  });

  it('returns nothing for empty stdin, which is how a manual run is detected', () => {
    expect(parseRefUpdates('')).toEqual([]);
  });
});
