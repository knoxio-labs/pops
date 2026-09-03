import type { Catalog, ScreenEntry } from '../registry';
import type { Capabilities } from './address';

export interface SurfaceCoords {
  experimentId?: string;
  variantId?: string;
  screenId?: string;
  /** A flow step's own slug, as it appears in `?step=`. */
  stepId?: string;
}

/**
 * The screen set visible for a design: main screens, or a variant's screens
 * overlaid onto main by id. Null when the named experiment/variant does not
 * exist.
 */
export function resolveScreens(
  catalog: Catalog,
  experimentId: string | undefined,
  variantId: string | undefined
): ScreenEntry[] | null {
  if (!experimentId) return catalog.screens;
  const variant = catalog.experiments
    .find((e) => e.id === experimentId)
    ?.variants.find((v) => v.id === variantId);
  if (!variant) return null;
  const overridden = new Set(variant.screens.map((s) => s.id));
  return [...catalog.screens.filter((s) => !overridden.has(s.id)), ...variant.screens];
}

export interface Surface {
  screen?: ScreenEntry;
  step?: ScreenEntry;
}

/**
 * Resolve the active screen and (for a flow) step from URL coordinates.
 * A step is matched by its `slug` — the single path segment the address
 * grammar carries — never by its catalog-wide `id`. Naming no step at all
 * defaults to the first one; naming one that does not exist resolves to no
 * step, rather than silently standing in for a different one.
 */
export function resolveSurface(catalog: Catalog, coords: SurfaceCoords): Surface {
  const screens = resolveScreens(catalog, coords.experimentId, coords.variantId);
  const screen = screens?.find((s) => s.id === coords.screenId);
  if (!screen) return {};
  if (screen.steps) {
    const step = coords.stepId
      ? screen.steps.find((s) => s.slug === coords.stepId)
      : screen.steps[0];
    return { screen, step };
  }
  return { screen };
}

/** The named state ids on the active surface (the step if a flow, else the screen). */
export function statesAt(surface: Surface): string[] {
  const target = surface.step ?? surface.screen;
  return target?.states ? Object.keys(target.states) : [];
}

/** What a target screen can honour, for best-effort coordinate preservation. */
export function capabilitiesFor(
  catalog: Catalog,
  design: { experimentId?: string; variantId?: string },
  screenId: string
): Capabilities {
  const screen = resolveScreens(catalog, design.experimentId, design.variantId)?.find(
    (s) => s.id === screenId
  );
  const steps = screen?.steps?.map((s) => s.slug) ?? [];
  return {
    steps,
    statesFor: (stepId) => {
      if (!screen) return [];
      const target = screen.steps
        ? (screen.steps.find((s) => s.slug === stepId) ?? screen.steps[0])
        : screen;
      return target?.states ? Object.keys(target.states) : [];
    },
  };
}
