import { describe, expect, it } from 'vitest';

import { inputVariants } from './NumberInput.variants';

/**
 * The input is `flex-1` inside a flex row that also holds steppers and a
 * suffix. Without `min-w-0`, a flex item's default `min-width: auto` floors
 * it at its intrinsic content width, so in a narrow column it refuses to
 * shrink and the steppers/suffix spill out of the field (POPS-4354).
 */
describe('NumberInput inputVariants', () => {
  it('carries min-w-0 so the input can shrink below its intrinsic width', () => {
    expect(inputVariants().split(' ')).toContain('min-w-0');
  });
});
