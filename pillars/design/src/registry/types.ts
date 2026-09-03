import type { ComponentType } from 'react';

import type { FrameKind } from '../frames/kind';

/**
 * A screen is either a file (a leaf with a `component`) or a flow folder (with
 * ordered `steps`) — never both. A flow is one level deep: each step is itself
 * a leaf. Exactly one of `component` / `steps` is set.
 *
 * `id` is the screen's path under `screens/`, at any depth: the first segment
 * is the `area` and heads the sidebar, the last is the `slug`, and anything
 * between is `groups` — folders that nest the sidebar and mean nothing else.
 * A folder is a group unless it declares itself a flow with a `flow.yaml`.
 */
export interface ScreenEntry {
  id: string;
  area: string;
  /** The folders between the area and the slug; empty for a screen sitting directly in its area. */
  groups: string[];
  slug: string;
  title: string;
  order: number;
  component?: ComponentType;
  steps?: ScreenEntry[];
  /** On a flow: the aggregate of its steps; on a step: its own `meta.flowButtons`. */
  flowButtons?: boolean;
  /** The product chrome this screen declares as its default. */
  frame?: FrameKind;
  states?: Record<string, ComponentType>;
  /** Experiments whose declared screen is this one (main screens only). */
  experiments: ExperimentEntry[];
}

export type ExperimentStatus = 'active' | 'decided' | 'archived';

export interface VariantEntry {
  id: string;
  name: string;
  /** Overrides main screens by id; everything else falls through. */
  screens: ScreenEntry[];
}

export interface ExperimentEntry {
  id: string;
  name: string;
  question?: string;
  status: ExperimentStatus;
  /** The screen id this experiment explores — a main screen, or one a variant introduces. */
  screen: string;
  chosen?: string;
  rationale?: string;
  /** Product chrome for this experiment's variants, unless a screen overrides it. */
  frame?: FrameKind;
  variants: VariantEntry[];
}

/** Everything discovery found, plus every contract violation it noticed on the way. */
export interface Catalog {
  screens: ScreenEntry[];
  experiments: ExperimentEntry[];
  /** Contract violations. Never fatal: the rest of the catalog still renders. */
  errors: string[];
}

/** Every distinct area, in first-appearance order of the sorted screen list. */
export function areasOf(screens: readonly ScreenEntry[]): string[] {
  return [...new Set(screens.map((s) => s.area))];
}
