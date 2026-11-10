import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';
import { z } from 'zod';

import { PopsError } from '@pops/pillar-express';

import { tripsErrors } from '../errors.js';

it('statically registers every published Trips error constructor with the actual ADR-054 analyser', () => {
  const guard = new URL('../../../../../scripts/ci/check-error-codes.mjs', import.meta.url);
  const sources = ['errors.ts', 'route-errors.ts'].map((name) => ({
    path: `pillars/trips/src/api/${name}`,
    text: readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'),
  }));
  const script = `
    import { readFileSync } from 'node:fs';
    import { analyzeSources } from ${JSON.stringify(guard.href)};
    process.stdout.write(JSON.stringify(analyzeSources(JSON.parse(readFileSync(0, 'utf8')))));
  `;
  const result = z
    .object({
      findings: z.array(z.unknown()),
      registered: z.array(z.object({ code: z.string() })),
    })
    .parse(
      JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          input: JSON.stringify(sources),
          encoding: 'utf8',
        })
      )
    );
  expect(result.findings).toEqual([]);
  const runtimeCodes = Object.values(tripsErrors).map((raise) => {
    try {
      raise();
    } catch (error) {
      if (error instanceof PopsError) return error.code;
      throw error;
    }
    throw new Error('Expected a registered error constructor');
  });
  expect(result.registered.map((entry) => entry.code).toSorted()).toEqual(runtimeCodes.toSorted());
});
