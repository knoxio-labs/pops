import { describe, expect, it } from 'vitest';

import { buildItemPayload } from './useItemMutations';

import type { ItemFormValues } from './types';

const baseValues: ItemFormValues = {
  itemName: 'Cordless Drill',
  brand: '',
  model: '',
  itemId: '',
  type: '',
  condition: 'Good',
  locationId: '',
  inUse: false,
  deductible: false,
  purchaseDate: '',
  warrantyExpires: '',
  purchasePrice: '',
  replacementValue: '',
  resaleValue: '',
  assetId: '',
  notes: '',
};

describe('buildItemPayload — inUse (POPS-2432)', () => {
  it('omits inUse when the checkbox was never touched', () => {
    const payload = buildItemPayload(baseValues, false);
    expect(payload.inUse).toBeUndefined();
  });

  it("does not send the form's coerced-false default on an untouched edit save", () => {
    // The exact regression this guards: an unreviewed (NULL) row's checkbox
    // renders unchecked (false) because the form has no tri-state control.
    // Saving an unrelated field must not turn that display default into a
    // write that permanently marks the row reviewed.
    const payload = buildItemPayload({ ...baseValues, brand: 'Bosch', inUse: false }, false);
    expect(payload.inUse).toBeUndefined();
    expect(payload.brand).toBe('Bosch');
  });

  it('sends the checked value once the checkbox is touched', () => {
    const payload = buildItemPayload({ ...baseValues, inUse: true }, true);
    expect(payload.inUse).toBe(true);
  });

  it('sends an explicit false once the checkbox is touched and unchecked', () => {
    const payload = buildItemPayload({ ...baseValues, inUse: false }, true);
    expect(payload.inUse).toBe(false);
  });
});
