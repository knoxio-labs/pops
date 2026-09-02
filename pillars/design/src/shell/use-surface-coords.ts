import { useLocation } from 'react-router';

import { parseAddress, screenIdOf } from './address';

import type { SurfaceCoords } from './surface';

/** The surface coordinates of the current shell location, or null off-canvas. */
export function useSurfaceCoords(): (SurfaceCoords & { state?: string }) | null {
  const location = useLocation();
  const address = parseAddress(location.pathname, location.search);
  if (!address) return null;
  return {
    experimentId: address.experimentId,
    variantId: address.variantId,
    screenId: screenIdOf(address),
    stepId: address.stepId,
    state: address.state,
  };
}
