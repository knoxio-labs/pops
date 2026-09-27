import { describe, expect, it, vi } from 'vitest';

import { MAX_LABEL_IDS } from '../../labels-page/label-params.js';
import { containerSelectionActions } from './contents-actions.js';

describe('containerSelectionActions', () => {
  it('disables mutation actions with the read-only reason and caps label jobs', () => {
    const onExit = vi.fn();
    const actions = containerSelectionActions({
      ids: Array.from({ length: MAX_LABEL_IDS + 1 }, (_, index) => `item-${index}`),
      readOnlyReason: 'No connection. Changes are off until it is back.',
      onExit,
      onMove: vi.fn(),
      onLabel: vi.fn(),
      onLifecycle: vi.fn(),
    });

    expect(actions).toHaveLength(6);
    expect(actions.every((action) => action.disabledReason !== undefined)).toBe(true);
    expect(actions.find((action) => action.id === 'label')?.disabledReason).toBe(
      'No connection. Changes are off until it is back.'
    );
  });

  it('keeps the take-out refusal separate from label capacity', () => {
    const actions = containerSelectionActions({
      ids: ['one'],
      exitDisabledReason: 'Box is closed.',
      onExit: vi.fn(),
      onMove: vi.fn(),
      onLabel: vi.fn(),
      onLifecycle: vi.fn(),
    });

    expect(actions.find((action) => action.id === 'take-out')?.disabledReason).toBe(
      'Box is closed.'
    );
    expect(actions.find((action) => action.id === 'label')?.disabledReason).toBeUndefined();
  });
});
