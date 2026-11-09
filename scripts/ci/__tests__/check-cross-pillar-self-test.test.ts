import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;
const guard = fileURLToPath(new URL('../check-cross-pillar-expectations.mjs', import.meta.url));

describe('cross-pillar guard CLI self-test', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  it('tests its fixture independently of the first live catalogue operation', () => {
    const output = execFileSync(process.execPath, [guard, '--self-test'], { encoding: 'utf8' });
    expect(output).toContain('self-test OK');
  });
});
