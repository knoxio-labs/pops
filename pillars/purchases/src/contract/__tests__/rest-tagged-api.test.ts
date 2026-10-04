import { describe, expect, it } from 'vitest';

import { ErrorBodySchema } from '../rest-schemas.js';
import { purchasesContract } from '../rest.js';

describe('purchasesTaggedApiContract', () => {
  it('declares not-found responses on mounted line-item mutations', () => {
    expect(purchasesContract.tagged.attach.responses[404]).toBe(ErrorBodySchema);
    expect(purchasesContract.tagged.detach.responses[404]).toBe(ErrorBodySchema);
  });
});
