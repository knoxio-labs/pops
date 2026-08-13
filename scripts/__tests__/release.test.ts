/**
 * The release pipeline, on both halves of the thing that makes it dangerous.
 *
 * `release.sh` now runs on every push to `main`, so its bump computation is no
 * longer something an operator eyeballs before dispatching — it decides, alone,
 * what version 856 tags of history roll forward to. The tags on this repo are
 * not all semver: `build-<n>` from the iOS lane, rolling `v1`/`v2` majors, and
 * 4-segment and pre-release variants all sort above the real previous release
 * under `-v:refname`. Picking one of those as `LAST_TAG` yields a bump computed
 * from the wrong base, and the first anyone knows of it is a tag on GHCR.
 *
 * The workflow half is asserted statically because it cannot be asserted any
 * other way: a release runs once, on `main`, and a broken one is a fleet-wide
 * outage. The two properties checked here are the two that fail silently —
 * a missing `actions: write` (the publish dispatch 403s, the semver image tags
 * never get pushed, and the release itself still reports success) and an asset
 * name that has drifted from what the packer emits.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import { bundleFileName } from '../pack-moltbot-bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const releaseScript = join(repoRoot, '.github', 'scripts', 'release.sh');
const workflowsDir = join(repoRoot, '.github', 'workflows');

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop() as string, { recursive: true, force: true });
});

interface Commit {
  subject: string;
  body?: string;
}

interface ReleaseOutcome {
  outputs: Record<string, string>;
  notes: string | undefined;
  stdout: string;
}

/**
 * Run `release.sh` against a throwaway repo whose history is exactly `tags`
 * (all on the base commit) followed by `commits`.
 *
 * @param options.tags Tag names to place on the base commit, in order.
 * @param options.commits Commits made after those tags.
 */
function runRelease({
  tags = [],
  commits = [],
}: {
  tags?: readonly string[];
  commits?: readonly Commit[];
}): ReleaseOutcome {
  const cwd = mkdtempSync(join(tmpdir(), 'release-sh-'));
  temps.push(cwd);
  // Hermetic: the developer's global config decides whether a bare `git tag`
  // is annotated and whether it is signed, and either would make this suite
  // pass or fail for reasons that have nothing to do with release.sh.
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe', env });

  git('init', '-q', '-b', 'main');
  writeFileSync(join(cwd, 'seed'), 'seed\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore: seed');
  // Annotated, as release.yml creates them.
  for (const tag of tags) git('tag', '-a', tag, '-m', tag);

  for (const [index, commit] of commits.entries()) {
    writeFileSync(join(cwd, `f${index}`), `${index}\n`);
    git('add', '-A');
    const message =
      commit.body === undefined ? commit.subject : `${commit.subject}\n\n${commit.body}`;
    git('commit', '-q', '-m', message);
  }

  const outputPath = join(cwd, 'github-output');
  writeFileSync(outputPath, '');
  const stdout = execFileSync('bash', [releaseScript], {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...env, GITHUB_OUTPUT: outputPath, GITHUB_REPOSITORY: 'knoxio-labs/pops' },
  });

  const outputs: Record<string, string> = {};
  for (const line of readFileSync(outputPath, 'utf8').split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0) outputs[line.slice(0, separator)] = line.slice(separator + 1);
  }
  const notesPath = join(cwd, 'release-notes.md');
  return {
    outputs,
    notes: existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : undefined,
    stdout,
  };
}

/** The tag shapes this repo actually carries alongside its releases. */
const NOISE_TAGS = ['build-172', 'build-1810', 'v1', 'v2', 'v1.2.3-rc.1', 'v1.2.3.4'] as const;

describe('release.sh — previous-tag resolution', () => {
  it('picks the highest strict semver tag out of the real tag zoo', () => {
    const { outputs } = runRelease({
      tags: [...NOISE_TAGS, 'v0.406.1', 'v1.0.0', 'v1.1.0'],
      commits: [{ subject: 'feat(finance): add a thing' }],
    });
    expect(outputs.previous).toBe('v1.1.0');
    expect(outputs.version).toBe('1.2.0');
  });

  it('does not mistake a 4-segment or pre-release tag for a release', () => {
    const { outputs } = runRelease({
      tags: ['v0.9.0', 'v0.9.1-rc.4', 'v0.9.1.1'],
      commits: [{ subject: 'fix(core): patch a thing' }],
    });
    expect(outputs.previous).toBe('v0.9.0');
    expect(outputs.version).toBe('0.9.1');
  });

  it('starts at 0.0.0 when no semver tag exists yet', () => {
    const { outputs } = runRelease({
      tags: ['build-1', 'v1'],
      commits: [{ subject: 'feat: first real feature' }],
    });
    expect(outputs.previous).toBe('v0.0.0');
    expect(outputs.version).toBe('0.1.0');
  });
});

describe('release.sh — bump computation', () => {
  it('bumps minor on a feat', () => {
    expect(
      runRelease({ tags: ['v1.4.2'], commits: [{ subject: 'feat(ai): thing' }] }).outputs.version
    ).toBe('1.5.0');
  });

  it('bumps patch on fix and perf', () => {
    expect(
      runRelease({ tags: ['v1.4.2'], commits: [{ subject: 'fix: thing' }] }).outputs.version
    ).toBe('1.4.3');
    expect(
      runRelease({ tags: ['v1.4.2'], commits: [{ subject: 'perf(media): thing' }] }).outputs.version
    ).toBe('1.4.3');
  });

  it('bumps major post-1.0 on a `type!:` subject', () => {
    expect(
      runRelease({ tags: ['v1.4.2'], commits: [{ subject: 'feat(infra)!: rename a service' }] })
        .outputs.version
    ).toBe('2.0.0');
  });

  it('bumps major post-1.0 on either BREAKING CHANGE footer spelling', () => {
    for (const footer of ['BREAKING CHANGE: renamed', 'BREAKING-CHANGE: renamed']) {
      expect(
        runRelease({ tags: ['v1.4.2'], commits: [{ subject: 'fix: thing', body: footer }] }).outputs
          .version
      ).toBe('2.0.0');
    }
  });

  it('collapses a breaking change into a minor pre-1.0', () => {
    expect(
      runRelease({ tags: ['v0.5.3'], commits: [{ subject: 'feat!: break a thing' }] }).outputs
        .version
    ).toBe('0.6.0');
  });

  it('takes the largest bump across the range, not the last one', () => {
    expect(
      runRelease({
        tags: ['v1.4.2'],
        commits: [
          { subject: 'feat: a feature' },
          { subject: 'fix: a fix' },
          { subject: 'docs: a doc' },
        ],
      }).outputs.version
    ).toBe('1.5.0');
  });

  it('cuts no release when nothing releasable landed', () => {
    const { outputs, notes } = runRelease({
      tags: ['v1.4.2'],
      commits: [
        { subject: 'chore(deps): bump something' },
        { subject: 'docs: rewrite a runbook' },
        { subject: 'refactor: move a file' },
        { subject: 'test: add a case' },
      ],
    });
    expect(outputs.release).toBe('false');
    expect(outputs.version).toBeUndefined();
    expect(notes).toBeUndefined();
  });

  // A subject that merely *contains* a type word is not a conventional commit.
  it('ignores a type keyword that is not the subject prefix', () => {
    expect(
      runRelease({
        tags: ['v1.4.2'],
        commits: [{ subject: 'chore: revisit the feat: naming convention' }],
      }).outputs.release
    ).toBe('false');
  });
});

describe('release.sh — release notes', () => {
  it('groups commits by type and links the compare range', () => {
    const { notes } = runRelease({
      tags: ['v1.4.2'],
      commits: [
        { subject: 'feat(finance): tag rules' },
        { subject: 'fix(media): poster fallback' },
        { subject: 'docs: runbook' },
      ],
    });
    expect(notes).toContain('https://github.com/knoxio-labs/pops/compare/v1.4.2...v1.5.0');
    expect(notes).toContain('### Features');
    expect(notes).toContain('### Bug Fixes');
    expect(notes).toContain('### Documentation');
    // The `type(scope):` prefix is stripped; the subject survives.
    expect(notes).toContain('* tag rules');
    expect(notes).not.toContain('feat(finance):');
  });
});

interface WorkflowStep {
  name?: string;
  run?: string;
}

interface Workflow {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

function workflow(file: string): Workflow {
  return parseYaml(readFileSync(join(workflowsDir, file), 'utf8')) as Workflow;
}

/** Every `run:` block across every job in a workflow. */
function runBlocks(doc: Workflow): string[] {
  return Object.values(doc.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).map((step) => step.run ?? '')
  );
}

describe('release.yml wiring', () => {
  const release = workflow('release.yml');

  it('runs on every push to main', () => {
    // `js-yaml` reads the bare `on:` key as the boolean true, per YAML 1.1.
    const triggers =
      release.on ?? (release as unknown as Record<string, Workflow['on']>).true ?? {};
    const push = (triggers as { push?: { branches?: string[] } }).push;
    expect(push?.branches, 'release.yml must auto-trigger on main').toContain('main');
    expect(triggers).toHaveProperty('workflow_dispatch');
  });

  it('grants the permission the publish dispatch needs', () => {
    const dispatches = runBlocks(release).some((run) => /gh workflow run/u.test(run));
    expect(dispatches, 'release.yml no longer dispatches the publish workflow').toBe(true);
    // Without this the dispatch 403s and the release still reports success.
    expect(release.permissions?.actions).toBe('write');
    expect(release.permissions?.contents).toBe('write');
  });

  it('dispatches a workflow that exists and accepts a dispatch', () => {
    const dispatched = runBlocks(release)
      .flatMap((run) => [...run.matchAll(/gh workflow run\s+(\S+)/gu)])
      .map((match) => match[1] as string);
    expect(dispatched.length).toBeGreaterThan(0);
    for (const target of dispatched) {
      expect(existsSync(join(workflowsDir, target)), `${target} does not exist`).toBe(true);
      const triggers =
        workflow(target).on ?? (workflow(target) as unknown as Record<string, Workflow['on']>).true;
      expect(triggers, `${target} has no triggers`).toHaveProperty('workflow_dispatch');
    }
  });

  it('attaches the asset name the packer actually writes', () => {
    const asset = runBlocks(release)
      .flatMap((run) => [...run.matchAll(/"(dist\/[^"]*\$\{NEW_VERSION\}[^"]*)"/gu)])
      .map((match) => (match[1] as string).replace('${NEW_VERSION}', '1.2.3'));
    expect(asset).toEqual([join('dist', bundleFileName('v1.2.3'))]);
  });

  it('packs the bundle before it creates the release', () => {
    const blocks = runBlocks(release);
    const packed = blocks.findIndex((run) => run.includes('pack-moltbot-bundle.mjs'));
    const published = blocks.findIndex((run) => run.includes('gh release create'));
    expect(packed).toBeGreaterThanOrEqual(0);
    expect(published).toBeGreaterThan(packed);
  });
});
