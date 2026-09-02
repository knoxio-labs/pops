import { srcRelative } from './paths';
import { screenMetaSchema, statesSchema } from './schemas';

import type { ComponentType } from 'react';

import type { ScreenEntry } from './types';

type Modules = Record<string, Record<string, unknown>>;

/** Read the optional `states` export; a malformed one is a contract error, not a crash. */
function parseStates(
  raw: unknown,
  path: string,
  errors: string[]
): Record<string, ComponentType> | undefined {
  if (raw === undefined) return undefined;
  const parsed = statesSchema.safeParse(raw);
  if (!parsed.success) {
    errors.push(`${path}: invalid \`states\` export — must be a map of name → render thunk`);
    return undefined;
  }
  return Object.keys(parsed.data).length > 0 ? parsed.data : undefined;
}

function isComponent(value: unknown): value is ComponentType {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}

interface ScreenCoords {
  area: string;
  slug: string;
}

function parseScreenModule(
  mod: Record<string, unknown>,
  coords: ScreenCoords,
  path: string,
  errors: string[]
): ScreenEntry | null {
  if (!isComponent(mod.default)) {
    errors.push(`${path}: missing default component export`);
    return null;
  }
  const meta = screenMetaSchema.safeParse(mod.meta);
  if (!meta.success) {
    errors.push(`${path}: missing or invalid \`meta\` export (needs { title })`);
    return null;
  }
  return {
    id: `${coords.area}/${coords.slug}`,
    area: coords.area,
    slug: coords.slug,
    title: meta.data.title,
    order: meta.data.order ?? Number.MAX_SAFE_INTEGER,
    component: mod.default,
    flowButtons: meta.data.flowButtons,
    states: parseStates(mod.states, path, errors),
    experiments: [],
  };
}

function byOrder(a: ScreenEntry, b: ScreenEntry): number {
  return a.area.localeCompare(b.area) || a.order - b.order || a.slug.localeCompare(b.slug);
}

/** "request-quote" → "Request quote" — a flow folder has no file to carry a title. */
function prettifyId(id: string): string {
  const spaced = id.replace(/-/gu, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The path segments after `prefix`, or null when the module is not under it. */
function segmentsUnder(globPath: string, prefix: string): string[] | null {
  const path = srcRelative(globPath);
  if (!path.startsWith(prefix)) return null;
  return path
    .slice(prefix.length)
    .replace(/\.tsx$/u, '')
    .split('/');
}

function collectLeaves(modules: Modules, prefix: string, errors: string[]): ScreenEntry[] {
  const screens: ScreenEntry[] = [];
  for (const [globPath, mod] of Object.entries(modules)) {
    const segments = segmentsUnder(globPath, prefix);
    if (!segments || segments.length !== 2) continue;
    const [area, slug] = segments;
    if (!area || !slug) continue;
    const screen = parseScreenModule(mod, { area, slug }, srcRelative(globPath), errors);
    if (screen) screens.push(screen);
  }
  return screens;
}

function collectFlows(modules: Modules, prefix: string, errors: string[]): ScreenEntry[] {
  const stepsByFlow = new Map<string, ScreenEntry[]>();
  for (const [globPath, mod] of Object.entries(modules)) {
    const segments = segmentsUnder(globPath, prefix);
    if (!segments || segments.length !== 3) continue;
    const [area, flow, step] = segments;
    if (!area || !flow || !step) continue;
    const entry = parseScreenModule(mod, { area, slug: step }, srcRelative(globPath), errors);
    if (!entry) continue;
    const key = `${area}/${flow}`;
    stepsByFlow.set(key, [...(stepsByFlow.get(key) ?? []), entry]);
  }
  return [...stepsByFlow.entries()].map(([id, steps]) => {
    const [area, slug] = id.split('/') as [string, string];
    return {
      id,
      area,
      slug,
      title: prettifyId(slug),
      order: Math.min(...steps.map((s) => s.order)),
      steps: steps.toSorted(byOrder),
      flowButtons: steps.every((s) => s.flowButtons !== false),
      experiments: [],
    };
  });
}

function reportOverNesting(deepModules: Modules, prefix: string, errors: string[]): void {
  for (const globPath of Object.keys(deepModules)) {
    if (!srcRelative(globPath).startsWith(prefix)) continue;
    errors.push(`${srcRelative(globPath)}: a flow is one level deep — a step cannot be a folder`);
  }
}

export interface CollectScreensArgs {
  /** `<prefix><area>/<slug>.tsx` modules. */
  leafModules: Modules;
  /** `<prefix><area>/<flow>/<step>.tsx` modules. */
  flowModules: Modules;
  /** `<prefix><area>/<flow>/<x>/<y>.tsx` modules — always a contract error. */
  deepModules: Modules;
  /** `src`-relative directory the screens live under, with trailing slash. */
  prefix: string;
  errors: string[];
}

/**
 * Discover the screens under `prefix`: `<area>/<slug>.tsx` is a leaf,
 * `<area>/<flow>/` is a flow of ordered steps. An id used by both a file and
 * a folder, or a step nested deeper than one level, is a contract error.
 */
export function collectScreens({
  leafModules,
  flowModules,
  deepModules,
  prefix,
  errors,
}: CollectScreensArgs): ScreenEntry[] {
  const leaves = collectLeaves(leafModules, prefix, errors);
  const flows = collectFlows(flowModules, prefix, errors);
  reportOverNesting(deepModules, prefix, errors);

  const leafIds = new Set(leaves.map((s) => s.id));
  for (const flow of flows) {
    if (leafIds.has(flow.id)) {
      errors.push(`${prefix}${flow.id}: screen id is both a file and a flow folder — choose one`);
    }
  }
  return [...leaves, ...flows].toSorted(byOrder);
}
