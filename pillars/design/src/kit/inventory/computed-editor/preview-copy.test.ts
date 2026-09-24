import { describe, expect, it } from 'vitest';

import { unavailableSentence } from './preview-copy';

import type { PreviewMissingInput } from './scenario';

describe('unavailableSentence', () => {
  it('names the one missing input as a plain sentence', () => {
    const missing: readonly PreviewMissingInput[] = [
      { reason: 'missing_dependency', fieldLabel: 'Package count', itemLabel: 'USB-C cable' },
    ];
    expect(unavailableSentence(missing)).toBe('Package count is empty on USB-C cable.');
  });

  it('counts and lists every missing input, in order, when a coalesce leaves several', () => {
    const missing: readonly PreviewMissingInput[] = [
      { reason: 'missing_dependency', fieldLabel: 'Replacement quote', itemLabel: 'Travel kit' },
      { reason: 'reference_deleted', fieldLabel: 'Part of', itemLabel: 'Sample cable pack' },
    ];
    const sentence = unavailableSentence(missing);
    expect(sentence).toContain('2 inputs are missing');
    expect(sentence).toContain('Replacement quote is empty on Travel kit');
    expect(sentence).toContain('Part of on Sample cable pack points at an item that was deleted');
  });
});
