/**
 * A job may not inherit a skip it never asked for.
 *
 * GitHub evaluates a job's default condition, `success()`, over the **whole
 * transitive `needs` graph** — not over its direct `needs`. So one conditional
 * job at the top of a chain skips everything below it, however many hops down,
 * and however unconditional those jobs look when you read them.
 *
 * `.github/workflows/quality.yml` is built on exactly that chain. `discover`
 * runs only on `pull_request`; `scope` needs it, carries `if: always()`, and
 * duly runs on a `push` to `main` reporting `success` and `dirs="."`. The four
 * jobs below it — `Lint`, `Format`, `Module boundaries`, `Exports discipline`
 * — took the default and were therefore skipped on every push to `main`, even
 * though their own direct dependency had succeeded. The whole-tree sweep that
 * the workflow header promises, the one thing that reads paths outside the
 * per-PR unit scoping, never executed. Nothing went red to say so: a skipped
 * job does not fail a workflow conclusion, so `Quality` and the aggregated
 * `CI Gate` stayed green over a tree nobody had swept. Real drift sat on `main`
 * underneath that green.
 *
 * The property is invisible by inspection — `needs: scope` beside a `scope`
 * that plainly runs reads as correct — so it is asserted here instead, over
 * every workflow rather than the one that had the bug.
 *
 * **Only a status check function breaks the inherited skip.** This is the part
 * worth knowing before editing a condition: `always()` and `!cancelled()` do,
 * and a plain expression such as `github.event_name == 'push'` does not. A
 * naive fix that reaches for the plain form looks right, reads right, and still
 * skips — which is why the degenerate cases below cover it explicitly.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ConfigParseError, isMapping, parseYaml } from '../config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = resolve(here, '..', '..', '..', '.github', 'workflows');

/**
 * A condition that lets a job run even though something upstream was skipped.
 *
 * Deliberately narrow. `failure()` and `cancelled()` are status check functions
 * too and would also break the inheritance, but neither can be true on the path
 * this protects, so accepting them would only widen what passes review.
 */
const BREAKS_INHERITED_SKIP = /(?:^|[^\w.])(?:always\(\s*\)|!\s*cancelled\(\s*\))/u;

interface Workflow {
  readonly file: string;
  readonly jobs: ReadonlyMap<string, Record<string, unknown>>;
}

interface JobReachability {
  readonly job: string;
  readonly condition: string | undefined;
  /** Upstream jobs, at any depth, that some event can skip. */
  readonly skippableAncestors: readonly string[];
  /** `needs` entries naming a job the workflow does not define. */
  readonly unknownNeeds: readonly string[];
  /** True when this job still runs after a skipped ancestor. */
  readonly survivesAncestorSkip: boolean;
}

/**
 * Parse one workflow into its job table.
 *
 * A document that does not parse, or that has no `jobs:` mapping, raises rather
 * than yielding an empty table — an unreadable workflow must not read back as a
 * workflow with nothing to check.
 */
function readWorkflow(file: string): Workflow {
  const doc = parseYaml(readFileSync(join(workflowsDir, file), 'utf8'), file);
  if (!isMapping(doc)) throw new ConfigParseError(file, 'top level is not a mapping');
  if (!isMapping(doc.jobs)) throw new ConfigParseError(file, 'has no `jobs:` mapping');
  const jobs = new Map<string, Record<string, unknown>>();
  for (const [name, job] of Object.entries(doc.jobs)) {
    if (!isMapping(job)) throw new ConfigParseError(file, `job "${name}" is not a mapping`);
    jobs.set(name, job);
  }
  return { file, jobs };
}

/** `needs:` in either of its spellings — a single scalar or a sequence. */
function needsOf(workflow: Workflow, job: string): string[] {
  const value = workflow.jobs.get(job)?.needs;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function conditionOf(workflow: Workflow, job: string): string | undefined {
  const value = workflow.jobs.get(job)?.if;
  return typeof value === 'string' ? value : undefined;
}

/**
 * True when some event can leave this job `skipped`.
 *
 * A job whose condition breaks the inherited skip is not itself skippable by an
 * upstream skip — but it is still the ancestor that matters when its OWN
 * condition is event-shaped, which is why the two questions are separate.
 */
function isSkippable(workflow: Workflow, job: string): boolean {
  const condition = conditionOf(workflow, job);
  if (condition === undefined) return workflow.jobs.get(job)?.if !== undefined;
  return !BREAKS_INHERITED_SKIP.test(condition);
}

/** Every job reachable upstream through `needs`, at any depth. Cycle-safe. */
function ancestorsOf(workflow: Workflow, job: string, seen = new Set<string>()): Set<string> {
  for (const parent of needsOf(workflow, job)) {
    if (seen.has(parent)) continue;
    seen.add(parent);
    ancestorsOf(workflow, parent, seen);
  }
  return seen;
}

/** Every job in a workflow that has at least one skippable ancestor. */
function analyse(workflow: Workflow): JobReachability[] {
  const analysed: JobReachability[] = [];
  for (const job of workflow.jobs.keys()) {
    const ancestors = [...ancestorsOf(workflow, job)];
    const unknownNeeds = ancestors.filter((name) => !workflow.jobs.has(name));
    const skippableAncestors = ancestors.filter(
      (name) => workflow.jobs.has(name) && isSkippable(workflow, name)
    );
    if (skippableAncestors.length === 0 && unknownNeeds.length === 0) continue;
    const condition = conditionOf(workflow, job);
    analysed.push({
      job,
      condition,
      skippableAncestors,
      unknownNeeds,
      survivesAncestorSkip: condition !== undefined && BREAKS_INHERITED_SKIP.test(condition),
    });
  }
  return analysed;
}

function violationsIn(workflow: Workflow): JobReachability[] {
  return analyse(workflow).filter((entry) => !entry.survivesAncestorSkip);
}

/** Build a `Workflow` from an inline document, for the degenerate cases. */
function fixture(yaml: string): Workflow {
  const doc = parseYaml(yaml, '<fixture>');
  if (!isMapping(doc) || !isMapping(doc.jobs)) throw new ConfigParseError('<fixture>', 'no jobs');
  const jobs = new Map<string, Record<string, unknown>>();
  for (const [name, job] of Object.entries(doc.jobs)) {
    if (isMapping(job)) jobs.set(name, job);
  }
  return { file: '<fixture>', jobs };
}

const workflowFiles = readdirSync(workflowsDir)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .toSorted((a, b) => a.localeCompare(b));

describe('every workflow', () => {
  // Discovery floor. `it.each([])` registers no cases at all, so an empty
  // listing would leave the sweep below green having read nothing. Non-empty
  // plus a file that must exist is the whole requirement: the listing is a
  // `readdirSync` over one directory, which cannot lose a subset — it either
  // resolves the directory or it does not, and the named file proves which.
  it('is discovered on disk', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
    expect(workflowFiles).toContain('quality.yml');
  });

  it.each(workflowFiles)('%s — no job is skipped by an ancestor it survives on paper', (file) => {
    const workflow = readWorkflow(file);
    const violations = violationsIn(workflow).map(
      (entry) =>
        `${file} job "${entry.job}" takes if=${JSON.stringify(entry.condition)} but ` +
        `depends transitively on skippable job(s) [${entry.skippableAncestors.join(', ')}]` +
        (entry.unknownNeeds.length > 0
          ? ` and needs undefined job(s) [${entry.unknownNeeds.join(', ')}]`
          : '')
    );
    expect(
      violations,
      "These jobs will be SKIPPED whenever an upstream job is, because a job's default " +
        '`success()` is evaluated over the whole transitive `needs` graph. Add ' +
        "`if: always() && needs.<direct-dependency>.result == 'success'`. A plain " +
        'expression will not do it — only a status check function breaks the inherited skip.'
    ).toEqual([]);
  });
});

describe("quality.yml's push-to-main full-tree sweep", () => {
  // The four jobs whose unscoped branch (`dirs == "."`) is the only thing in CI
  // that reads paths outside the per-unit scoping — `clients/` among them.
  const SWEEP_JOBS = ['lint', 'format', 'boundaries', 'exports'] as const;
  const workflow = readWorkflow('quality.yml');

  it.each(SWEEP_JOBS)('%s exists and depends on scope', (job) => {
    expect(workflow.jobs.has(job), `quality.yml no longer defines a "${job}" job`).toBe(true);
    expect(needsOf(workflow, job)).toContain('scope');
  });

  it.each(SWEEP_JOBS)('%s still runs when discover is skipped on a push', (job) => {
    const entry = analyse(workflow).find((candidate) => candidate.job === job);
    expect(
      entry === undefined || entry.survivesAncestorSkip,
      `quality.yml job "${job}" would be skipped on a push to main, so the full-tree sweep ` +
        'the workflow header promises would not run. See the header for why the default ' +
        'condition is not enough here.'
    ).toBe(true);
  });

  it('reaches the sweep jobs through a chain that is genuinely conditional', () => {
    // Guards the guard: if `discover` ever stops being event-conditional the
    // assertions above pass trivially, and this is the line that says so.
    expect(isSkippable(workflow, 'discover')).toBe(true);
    expect(conditionOf(workflow, 'scope')).toMatch(BREAKS_INHERITED_SKIP);
  });
});

describe('the check reports (ADR-045 degenerate cases)', () => {
  const CHAIN = `
jobs:
  discover:
    if: github.event_name == 'pull_request'
    uses: ./.github/workflows/_discover-units.yml
  scope:
    needs: discover
    if: always()
    runs-on: ubuntu-latest
`;

  /** The exact shape that shipped, and skipped, on every push to main. */
  it('catches the historical bug — a downstream job taking the default', () => {
    const found = violationsIn(fixture(`${CHAIN}  lint:\n    needs: scope\n    runs-on: x\n`));
    expect(found.map((entry) => entry.job)).toEqual(['lint']);
    expect(found[0]?.skippableAncestors).toEqual(['discover']);
  });

  it.each([
    ["github.event_name == 'push'", 'a plain expression is not a status check function'],
    ['success()', 'success() is the default that caused the bug'],
    ["needs.scope.result == 'success'", 'the result guard alone does not break the skip'],
    ['false', 'a literal never breaks the skip'],
  ])('catches if=%s — %s', (condition) => {
    const found = violationsIn(
      fixture(`${CHAIN}  lint:\n    needs: scope\n    if: ${condition}\n    runs-on: x\n`)
    );
    expect(found.map((entry) => entry.job)).toEqual(['lint']);
  });

  it.each([
    "always() && needs.scope.result == 'success'",
    // A leading `!` opens a YAML tag, so this form only exists quoted.
    '"!cancelled() && needs.scope.result == \'success\'"',
    '${{ always() }}',
  ])('accepts if=%s', (condition) => {
    const found = violationsIn(
      fixture(`${CHAIN}  lint:\n    needs: scope\n    if: ${condition}\n    runs-on: x\n`)
    );
    expect(found).toEqual([]);
  });

  it('follows the chain further than one hop', () => {
    // The bug was two hops from its cause. A checker that only looked at direct
    // `needs` would have called the original file clean.
    const deep = `${CHAIN}  a:\n    needs: scope\n    if: always()\n    runs-on: x\n  b:\n    needs: a\n    runs-on: x\n`;
    expect(violationsIn(fixture(deep)).map((entry) => entry.job)).toEqual(['b']);
  });

  it('does not flag a job whose whole chain is unconditional', () => {
    const clean = `
jobs:
  build:
    runs-on: x
  test:
    needs: build
    runs-on: x
`;
    expect(analyse(fixture(clean))).toEqual([]);
  });

  it('flags a needs pointing at a job that does not exist', () => {
    const dangling = `
jobs:
  test:
    needs: typo
    runs-on: x
`;
    expect(violationsIn(fixture(dangling))[0]?.unknownNeeds).toEqual(['typo']);
  });

  it('refuses an unparseable workflow instead of reading it as empty', () => {
    expect(() => fixture('jobs:\n  a:\n   b: [unclosed\n')).toThrow(ConfigParseError);
  });

  it('refuses a workflow with no jobs mapping instead of reporting it clean', () => {
    expect(() => fixture('on: push\n')).toThrow(ConfigParseError);
  });
});
