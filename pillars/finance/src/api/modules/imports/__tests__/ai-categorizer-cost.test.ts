import { describe, expect, it } from 'vitest';

import { FINANCE_AI_MODEL_OPTIONS } from '../../../../contract/settings/ai-settings-keys.js';
import { financeManifest } from '../../../../contract/settings/finance-manifest.js';
import { computeCostUsd } from '../ai-categorizer-config.js';

describe('computeCostUsd', () => {
  it.each([
    ['claude-haiku-4-5-20251001', 6],
    ['claude-sonnet-5-5', 12],
    ['claude-opus-5-5', 24],
  ])('prices %s at its own rates', (model, expected) => {
    expect(computeCostUsd(model, 1_000_000, 1_000_000)).toBeCloseTo(expected, 9);
  });

  it('prices every model the settings offer', () => {
    for (const option of FINANCE_AI_MODEL_OPTIONS) {
      expect(computeCostUsd(option.value, 1_000_000, 0)).toBe(option.inputCostPerMtok);
      expect(computeCostUsd(option.value, 0, 1_000_000)).toBe(option.outputCostPerMtok);
    }
  });

  it('estimates a model outside the list at the default rates', () => {
    expect(computeCostUsd('claude-sonnet-4-6', 1_000_000, 1_000_000)).toBeCloseTo(6, 9);
  });

  it('is zero for no tokens', () => {
    expect(computeCostUsd('claude-opus-5-5', 0, 0)).toBe(0);
  });
});

describe('finance model settings', () => {
  it('offers value and label only, keeping the rates out of the manifest', () => {
    const selects = financeManifest.groups
      .flatMap((group) => group.fields)
      .filter((field) => field.type === 'select' && field.key.endsWith('.model'));

    expect(selects).toHaveLength(2);
    for (const field of selects) {
      expect(field.options).toEqual(
        FINANCE_AI_MODEL_OPTIONS.map(({ value, label }) => ({ value, label }))
      );
    }
  });
});
