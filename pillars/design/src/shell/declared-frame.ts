/**
 * The product chrome a surface declares for itself, so an iOS screen opens in
 * the phone instead of inheriting whatever frame the last screen left behind.
 *
 * Most specific wins: the screen actually on the canvas (a variant's override,
 * if the address names one), then the experiment being viewed, then nothing —
 * and nothing means keep the current frame rather than reset it, because a
 * screen that says nothing about chrome is not the same as a screen that says
 * "no chrome".
 */
import { screenIdOf, type Address } from './address';
import { resolveSurface } from './surface';

import type { FrameKind } from '../frames/kind';
import type { Catalog } from '../registry';

export function declaredFrame(catalog: Catalog, address: Address | null): FrameKind | undefined {
  if (!address) return undefined;
  const { screen, step } = resolveSurface(catalog, {
    experimentId: address.experimentId,
    variantId: address.variantId,
    screenId: screenIdOf(address),
    stepId: address.stepId,
  });
  const experiment = address.experimentId
    ? catalog.experiments.find((e) => e.id === address.experimentId)
    : undefined;
  return step?.frame ?? screen?.frame ?? experiment?.frame;
}

/**
 * Identity of the surface for the purpose of applying a declared frame: the
 * design and the screen, but NOT the step or the state. Stepping through a
 * flow or switching state is staying put, so it must not undo a frame you
 * chose by hand.
 */
export function surfaceKeyOf(address: Address | null): string {
  if (!address) return '';
  return `${address.experimentId ?? ''}/${address.variantId ?? ''}/${screenIdOf(address)}`;
}
