export type DeltaState = 'balanced' | 'short' | 'over';

/**
 * `Σ proposed − charge`, read as a state.
 *
 * `over` is not a rounding artefact: it means more money has been linked to a
 * charge than the charge is for, which the contract calls out as a bug worth
 * surfacing rather than clamping away.
 */
export function deltaState(deltaCents: number): DeltaState {
  if (deltaCents === 0) return 'balanced';
  return deltaCents < 0 ? 'short' : 'over';
}
