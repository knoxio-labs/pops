import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const workflow = (name: string) =>
  readFileSync(join(repoRoot, '.github', 'workflows', name), 'utf8');

describe('fast CI workflow wiring', () => {
  it('computes an affected app matrix and self-tests codegen only once', () => {
    const appQuality = workflow('app-quality.yml');

    expect(appQuality).toContain('select-affected-apps.mjs');
    expect(appQuality.match(/check-generated-clients\.mjs --self-test/gu)).toHaveLength(1);
    expect(appQuality).toContain('git merge-base --is-ancestor');
    expect(appQuality).toContain('select-affected-apps.mjs --all');
    expect(appQuality).toContain('github.event_name }}" = "merge_group"');
  });

  it('keeps review cancellation while reducing the ordinary debounce', () => {
    const review = workflow('pr-review.yml');

    expect(review).toContain('cancel-in-progress: true');
    expect(review).toContain('vars.PR_REVIEW_DEBOUNCE || 15');
    expect(review).toContain('current=$(gh api');
    expect(review).toContain('if [ "$current" != "$EVENT_SHA" ]');
  });

  it('does not schedule opposite-language unit jobs', () => {
    const discovery = workflow('_discover-units.yml');
    const unitQuality = workflow('unit-quality.yml');

    expect(discovery).toContain('changedTs:');
    expect(discovery).toContain('changedRust:');
    expect(unitQuality).toContain('fromJson(needs.discover.outputs.changedTs)');
    expect(unitQuality).toContain('fromJson(needs.discover.outputs.changedRust)');
    expect(unitQuality).not.toContain("matrix.unit.lang != 'ts'");
    expect(unitQuality).not.toContain("matrix.unit.lang != 'rust'");
  });

  it('passes changed TypeScript project paths without word splitting', () => {
    const quality = workflow('quality.yml');

    expect(quality).toContain('projects+=("$d/tsconfig.build.json")');
    expect(quality).toContain('pnpm exec tsc -b "${projects[@]}"');
    expect(quality).not.toContain('pnpm exec tsc -b $projects');
  });
});
