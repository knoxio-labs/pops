import { describe, expect, it } from 'vitest';

import { aiConfigManifest } from '../settings/ai-manifest.js';

import type { SettingsField, SettingsGroup } from '@pops/types';

describe('aiConfigManifest', () => {
  const fields = aiConfigManifest.groups.flatMap((g: SettingsGroup) => g.fields);

  it('declares only the budget and retention keys', () => {
    expect(fields.map((f: SettingsField) => f.key)).toEqual([
      'ai.monthlyTokenBudget',
      'ai.budgetExceededFallback',
      'ai.logRetentionDays',
    ]);
  });

  it('offers no model selector or per-pipeline model override', () => {
    for (const field of fields) {
      expect(field.key).not.toMatch(/^ai\.model/);
    }
    expect(aiConfigManifest.groups.map((g: SettingsGroup) => g.id)).not.toContain('model');
    expect(aiConfigManifest.groups.map((g: SettingsGroup) => g.id)).not.toContain('modelOverrides');
  });
});
