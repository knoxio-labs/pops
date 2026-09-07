/**
 * `.github/workflows/README.md` documents every workflow exactly once.
 *
 * The file used to carry raw counts instead — "23 workflow YAML files", "15
 * jobs" — and both rotted, the job count twice: it read 15 while the workflow
 * defined 20, and by the time that was picked up it defined 39. A count is the
 * weakest possible statement of coverage; it cannot say *which* workflow went
 * undocumented, and nothing was checking it. So the counts are gone and the
 * claim they were standing in for is asserted here instead: every YAML file in
 * the directory is either a row in the table or has its own `##` section, and
 * nothing is documented that is not on disk.
 *
 * That matters because the README's own header states every job below is
 * load-bearing and `ci-gate.yml` observes workflow-level conclusions — a reader
 * who takes the table for the full gate must not be wrong about it.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = resolve(here, '..', '..', '..', '.github', 'workflows');
const readmePath = join(workflowsDir, 'README.md');

const readme = readFileSync(readmePath, 'utf8');

function workflowFilesOnDisk(): string[] {
  return readdirSync(workflowsDir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .toSorted();
}

function uniqueCaptures(markdown: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const match of markdown.matchAll(pattern)) {
    const [, captured] = match;
    if (captured !== undefined) found.push(captured);
  }
  return [...new Set(found)].toSorted();
}

/** Files named in the first column of a `| \`x.yml\` | … |` table row. */
function tableRowFiles(markdown: string): string[] {
  return uniqueCaptures(markdown, /^\| `([^`]+\.ya?ml)`/gmu);
}

/** Files given their own `## \`x.yml\`` section heading. */
function sectionedFiles(markdown: string): string[] {
  return uniqueCaptures(markdown, /^## `([^`]+\.ya?ml)`/gmu);
}

/** Files whose only `on:` key is `workflow_call` — reusable, never self-triggering. */
function callOnlyFiles(): string[] {
  return workflowFilesOnDisk()
    .filter((file) => {
      const doc = parseYaml(readFileSync(join(workflowsDir, file), 'utf8'), file);
      if (!isMapping(doc)) return false;
      // YAML 1.1 reads a bare `on:` as the boolean true; the quoted form stays a string.
      const triggers = doc.on ?? doc.true;
      if (!isMapping(triggers)) return false;
      const keys = Object.keys(triggers);
      return keys.length === 1 && keys[0] === 'workflow_call';
    })
    .toSorted();
}

describe('the parsers themselves', () => {
  it('finds workflows on disk at all', () => {
    expect(workflowFilesOnDisk().length).toBeGreaterThan(0);
  });

  it('finds table rows at all', () => {
    expect(tableRowFiles(readme).length).toBeGreaterThan(0);
  });

  it('finds sectioned files at all', () => {
    expect(sectionedFiles(readme).length).toBeGreaterThan(0);
  });

  it('reads a row only from the first column, not from a filename cited in prose', () => {
    const markdown = '| `real.yml` | runs `decoy.yml` | notes |\n';
    expect(tableRowFiles(markdown)).toEqual(['real.yml']);
  });

  it('does not mistake a `###` subheading for a file section', () => {
    expect(sectionedFiles('### `nested.yml`\n')).toEqual([]);
  });
});

describe('.github/workflows/README.md coverage', () => {
  it('documents every workflow on disk, as a row or as a section', () => {
    const documented = new Set([...tableRowFiles(readme), ...sectionedFiles(readme)]);
    const undocumented = workflowFilesOnDisk().filter((f) => !documented.has(f));
    expect(
      undocumented,
      `${undocumented.join(', ')} exist in .github/workflows/ but appear neither as a table row ` +
        'nor under their own `##` section in README.md. Add a row, or a section if a row is not enough.'
    ).toEqual([]);
  });

  it('does not document a workflow that is not on disk', () => {
    const onDisk = new Set(workflowFilesOnDisk());
    const stale = [...tableRowFiles(readme), ...sectionedFiles(readme)].filter(
      (f) => !onDisk.has(f)
    );
    expect(
      stale,
      `README.md documents ${stale.join(', ')}, which no longer exist in .github/workflows/.`
    ).toEqual([]);
  });

  it('documents each workflow once — a file is a row or a section, never both', () => {
    const rows = new Set(tableRowFiles(readme));
    const both = sectionedFiles(readme).filter((f) => rows.has(f));
    expect(
      both,
      `${both.join(', ')} appear both in the table and under their own section; two descriptions ` +
        'of one workflow drift apart.'
    ).toEqual([]);
  });

  it('keeps every reusable workflow_call-only helper out of the table and in a section', () => {
    const sections = new Set(sectionedFiles(readme));
    const rows = new Set(tableRowFiles(readme));
    for (const file of callOnlyFiles()) {
      expect(sections.has(file), `${file} triggers on nothing of its own and needs a section`).toBe(
        true
      );
      expect(
        rows.has(file),
        `${file} has no trigger, so a Trigger-column row misdescribes it`
      ).toBe(false);
    }
  });

  it('records no job or file count, which is what rotted', () => {
    const counts = [...readme.matchAll(/\b\d+ (?:jobs?|workflow YAML files?)\b/gu)].map(
      (m) => m[0]
    );
    expect(
      counts,
      `README.md states ${counts.join(', ')}. Nothing verifies a bare count and it has already ` +
        'rotted twice — name the set, or let the table and sections stand on their own.'
    ).toEqual([]);
  });
});
