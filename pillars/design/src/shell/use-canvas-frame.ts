/**
 * Which product chrome the canvas draws, and how choosing one behaves.
 *
 * Resolved during render rather than in an effect: the iframe's initial `src`
 * carries the frame, so a frame decided after mount would load the surface
 * bare and only then tell it to grow a phone around itself.
 *
 * Three rules, in order. What a surface declares wins **on arrival** — and
 * arriving again, after going anywhere else, is another arrival, so a frame
 * picked by hand does not follow a screen around for the rest of the session.
 * That hand-picked frame wins for as long as you stay put. A surface that
 * declares nothing keeps the last frame you chose, which is what the stored
 * preference holds; that is deliberately not the same as declaring `none`.
 */
import { useCallback, useState } from 'react';

import { decodeFrame } from '../frames/kind';
import { declaredFrame, surfaceKeyOf } from './declared-frame';
import { useStoredString } from './storage';

import type { FrameKind } from '../frames/kind';
import type { Catalog } from '../registry';
import type { Address } from './address';

export const CANVAS_FRAME_KEY = 'pops-design-canvas-frame';

export function useCanvasFrame(
  catalog: Catalog,
  address: Address | null
): [FrameKind, (frame: FrameKind) => void] {
  const [frameRaw, setFrameRaw] = useStoredString(CANVAS_FRAME_KEY, 'none');
  const [chosen, setChosen] = useState<FrameKind | null>(null);
  const [surfaceAtChoice, setSurfaceAtChoice] = useState<string | null>(null);
  const surface = surfaceKeyOf(address);

  // Adjusting state during render — React re-runs this component before
  // painting, which is the point: a frame resolved in an effect would already
  // have been handed to the iframe as its `src`.
  if (surfaceAtChoice !== null && surfaceAtChoice !== surface) {
    setSurfaceAtChoice(null);
    setChosen(null);
  }

  const frame = chosen ?? declaredFrame(catalog, address) ?? decodeFrame(frameRaw);

  const select = useCallback(
    (next: FrameKind) => {
      setChosen(next);
      setSurfaceAtChoice(surface);
      setFrameRaw(next);
    },
    [setFrameRaw, surface]
  );

  return [frame, select];
}
