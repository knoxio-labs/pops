import { describe, expect, it } from 'vitest';

import { catalogueKeyFromLabel } from './types';

describe('catalogueKeyFromLabel', () => {
  it('normalises labels into catalogue keys', () => {
    expect(catalogueKeyFromLabel('  Café & Audio Gear  ')).toBe('cafe_audio_gear');
  });

  it('removes punctuation-only boundaries', () => {
    expect(catalogueKeyFromLabel('---Storage box---')).toBe('storage_box');
  });
});
