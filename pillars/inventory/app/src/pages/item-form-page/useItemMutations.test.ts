import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

import { applyConnections, buildItemPayload, reportCreateSuccess } from './useItemMutations';

import type { ItemFormValues, PendingConnection } from './types';

afterEach(() => {
  vi.clearAllMocks();
});

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

describe('applyConnections', () => {
  it('counts successes and failures separately', async () => {
    const pending: PendingConnection[] = [
      { id: 'a', itemName: 'A' },
      { id: 'b', itemName: 'B' },
      { id: 'c', itemName: 'C' },
    ];
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('conflict'))
      .mockRejectedValueOnce(new Error('conflict'));

    const outcome = await applyConnections('new-item', pending, { mutateAsync });

    expect(outcome).toEqual({ connected: 1, failed: 2 });
  });

  it('reports zero failures when there are no pending connections', async () => {
    const mutateAsync = vi.fn();
    const outcome = await applyConnections('new-item', [], { mutateAsync });
    expect(outcome).toEqual({ connected: 0, failed: 0 });
  });
});

describe('reportCreateSuccess', () => {
  it('reports plain success when there were no pending connections', () => {
    reportCreateSuccess({ connected: 0, failed: 0 });
    expect(toast.success).toHaveBeenCalledWith('Item created');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports success with a count when every connection succeeded', () => {
    reportCreateSuccess({ connected: 2, failed: 0 });
    expect(toast.success).toHaveBeenCalledWith('Item created with 2 connections');
  });

  it('does not report a bare success when every pending connection failed', () => {
    reportCreateSuccess({ connected: 0, failed: 3 });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Item created; 3 connections failed');
  });

  it('surfaces a partial failure alongside the successful connections', () => {
    reportCreateSuccess({ connected: 1, failed: 1 });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Item created with 1 connected; 1 connection failed');
  });
});
