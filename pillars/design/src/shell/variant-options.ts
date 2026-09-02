import { buildAddress, preserveCoordinates, type Address } from './address';
import { capabilitiesFor } from './surface';

import type { Catalog, ExperimentEntry, VariantEntry } from '../registry';

export interface DockOption {
  key: string;
  label: string;
  to?: string;
  isCurrent: boolean;
  chosen?: boolean;
  disabledNote?: string;
}

/** Where the user is now: a screen, optionally a step and a state. */
export interface Current {
  screenId: string;
  stepId?: string;
  state?: string;
}

function split(screenId: string): Pick<Address, 'area' | 'slug'> {
  const [area = '', slug = ''] = screenId.split('/');
  return { area, slug };
}

function variantTarget(catalog: Catalog, variant: VariantEntry, screenId: string): string {
  const reachable =
    variant.screens.some((s) => s.id === screenId) ||
    catalog.screens.some((s) => s.id === screenId);
  return reachable ? screenId : (variant.screens[0]?.id ?? screenId);
}

/** A variant's address for the current surface, preserving step and state where the target realises them. */
function variantAddress(
  catalog: Catalog,
  experiment: ExperimentEntry,
  variant: VariantEntry,
  current: Current
): string {
  const screenId = variantTarget(catalog, variant, current.screenId);
  const design = { experimentId: experiment.id, variantId: variant.id };
  const caps = capabilitiesFor(catalog, design, screenId);
  return buildAddress(
    preserveCoordinates(
      { ...design, ...split(screenId), stepId: current.stepId, state: current.state },
      caps
    )
  );
}

/**
 * Main's address for the current screen: the same screen when main has it,
 * else the nearest main screen this variant overrides. Null when the screen
 * only exists inside the variant, so Main shows disabled instead of
 * teleporting somewhere unrelated.
 */
function mainAddress(
  catalog: Catalog,
  variant: VariantEntry | undefined,
  current: Current
): string | null {
  const inMain = (id: string) => catalog.screens.some((s) => s.id === id);
  const screenId = inMain(current.screenId)
    ? current.screenId
    : (variant?.screens.find((vs) => inMain(vs.id))?.id ?? null);
  if (!screenId) return null;
  const caps = capabilitiesFor(catalog, {}, screenId);
  return buildAddress(
    preserveCoordinates({ ...split(screenId), stepId: current.stepId, state: current.state }, caps)
  );
}

export interface VariantContext {
  currentExperiment?: ExperimentEntry;
  currentVariant?: VariantEntry;
  groups: { experiment: ExperimentEntry; options: DockOption[] }[];
  mainOption: DockOption;
}

function relevantExperiments(
  catalog: Catalog,
  current: Current,
  active: { experimentId?: string } | undefined
): ExperimentEntry[] {
  const activeExperiments = catalog.experiments.filter((e) => e.status === 'active');
  if (active) {
    const found = activeExperiments.find((e) => e.id === active.experimentId);
    return found ? [found] : [];
  }
  return activeExperiments.filter((e) =>
    e.variants.some((v) => v.screens.some((s) => s.id === current.screenId))
  );
}

/** Everything the variant tool shows for the current surface; null when no experiment applies. */
export function buildVariantContext(
  catalog: Catalog,
  current: Current | null,
  active: { experimentId?: string; variantId?: string } | undefined
): VariantContext | null {
  if (!current) return null;
  const experiments = relevantExperiments(catalog, current, active);
  if (experiments.length === 0) return null;

  const currentExperiment = active ? experiments[0] : undefined;
  const currentVariant = currentExperiment?.variants.find((v) => v.id === active?.variantId);

  const groups = experiments.map((experiment) => ({
    experiment,
    options: experiment.variants.map((variant) => ({
      key: `${experiment.id}/${variant.id}`,
      label: variant.name,
      to: variantAddress(catalog, experiment, variant, current),
      isCurrent: currentVariant ? variant.id === currentVariant.id : false,
      chosen: experiment.chosen === variant.id,
    })),
  }));
  const mainTo = mainAddress(catalog, currentVariant, current);
  const mainOption: DockOption = {
    key: 'main',
    label: 'Main',
    to: mainTo ?? undefined,
    isCurrent: !active,
    disabledNote: mainTo ? undefined : 'only in this variant',
  };
  return { currentExperiment, currentVariant, groups, mainOption };
}
