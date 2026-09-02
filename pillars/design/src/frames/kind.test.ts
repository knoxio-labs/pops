import { describe, expect, it } from 'vitest';

import { decodeFrame, frameLabel, FRAME_KINDS, isFrameKind } from './kind';

describe('frame kind', () => {
  it('labels every kind it lists, so the dock cannot render an empty row', () => {
    for (const kind of FRAME_KINDS) {
      expect(frameLabel(kind)).not.toBe('');
    }
  });

  it('decodes a known kind and rejects everything else', () => {
    expect(decodeFrame('web')).toBe('web');
    expect(decodeFrame('ios')).toBe('ios');
    expect(decodeFrame('none')).toBe('none');
    expect(decodeFrame('android')).toBe('none');
    expect(decodeFrame('')).toBe('none');
    expect(decodeFrame(null)).toBe('none');
    expect(decodeFrame(undefined)).toBe('none');
  });

  it('narrows only on a listed kind', () => {
    expect(isFrameKind('web')).toBe(true);
    expect(isFrameKind('webbish')).toBe(false);
  });
});
