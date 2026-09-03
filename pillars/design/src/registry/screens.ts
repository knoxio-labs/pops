import { parseYamlFile, srcRelative } from './paths';
import { flowYamlSchema, screenMetaSchema, statesSchema } from './schemas';

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

function coordsOf(segments: string[]): Pick<ScreenEntry, 'id' | 'area' | 'groups' | 'slug'> {
  return {
    id: segments.join('/'),
    area: segments[0] ?? '',
    groups: segments.slice(1, -1),
    slug: segments.at(-1) ?? '',
  };
}

function parseScreenModule(
  mod: Record<string, unknown>,
  segments: string[],
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
    ...coordsOf(segments),
    title: meta.data.title,
    order: meta.data.order ?? Number.MAX_SAFE_INTEGER,
    component: mod.default,
    flowButtons: meta.data.flowButtons,
    frame: meta.data.frame,
    states: parseStates(mod.states, path, errors),
    experiments: [],
  };
}

function byOrder(a: ScreenEntry, b: ScreenEntry): number {
  return a.area.localeCompare(b.area) || a.order - b.order || a.id.localeCompare(b.id);
}

/** The path segments after `prefix`, or null when the module is not under it. */
function segmentsUnder(globPath: string, prefix: string): string[] | null {
  const path = srcRelative(globPath);
  if (!path.startsWith(prefix)) return null;
  return path
    .slice(prefix.length)
    .replace(/\.(?:tsx|yaml)$/u, '')
    .split('/');
}

interface FlowMarker {
  title: string;
  order?: number;
}

/** The declared flow folders, keyed by their path under `prefix`. */
function collectFlowMarkers(
  markers: Record<string, string>,
  prefix: string,
  errors: string[]
): Map<string, FlowMarker> {
  const flows = new Map<string, FlowMarker>();
  for (const [globPath, raw] of Object.entries(markers)) {
    const segments = segmentsUnder(globPath, prefix);
    if (!segments) continue;
    const dir = segments.slice(0, -1);
    const path = srcRelative(globPath);
    if (dir.length < 2) {
      errors.push(`${path}: a flow lives under an area — <area>/<flow>/flow.yaml`);
      continue;
    }
    const parsed = parseYamlFile(raw, flowYamlSchema, path, errors);
    if (parsed) flows.set(dir.join('/'), parsed);
  }
  return flows;
}

/** The flow folder a path sits strictly inside, longest first — null when it sits in none. */
function flowAncestorOf(dir: string, flows: Map<string, FlowMarker>): string | null {
  const segments = dir.split('/');
  for (let depth = segments.length - 1; depth >= 2; depth -= 1) {
    const candidate = segments.slice(0, depth).join('/');
    if (flows.has(candidate)) return candidate;
  }
  return null;
}

interface Sorted {
  leaves: ScreenEntry[];
  stepsByFlow: Map<string, ScreenEntry[]>;
}

/**
 * Place every module: a step of the flow folder it sits in, or a leaf screen
 * at its own path. A file directly under `prefix`, or nested below a flow, is
 * a contract error and is placed nowhere.
 */
function sortModules(
  modules: Modules,
  flows: Map<string, FlowMarker>,
  prefix: string,
  errors: string[]
): Sorted {
  const leaves: ScreenEntry[] = [];
  const stepsByFlow = new Map<string, ScreenEntry[]>();
  for (const [globPath, mod] of Object.entries(modules)) {
    const segments = segmentsUnder(globPath, prefix);
    if (!segments || segments.some((s) => s === '')) continue;
    const path = srcRelative(globPath);
    if (segments.length < 2) {
      errors.push(`${path}: a screen lives under an area — ${prefix}<area>/<screen>.tsx`);
      continue;
    }
    const dir = segments.slice(0, -1).join('/');
    if (flows.has(dir)) {
      const step = parseScreenModule(mod, segments, path, errors);
      if (step) stepsByFlow.set(dir, [...(stepsByFlow.get(dir) ?? []), step]);
      continue;
    }
    if (flowAncestorOf(dir, flows)) {
      errors.push(`${path}: a flow is one level deep — a step cannot be a folder`);
      continue;
    }
    const leaf = parseScreenModule(mod, segments, path, errors);
    if (leaf) leaves.push(leaf);
  }
  return { leaves, stepsByFlow };
}

function buildFlows(
  flows: Map<string, FlowMarker>,
  stepsByFlow: Map<string, ScreenEntry[]>,
  prefix: string,
  errors: string[]
): ScreenEntry[] {
  const entries: ScreenEntry[] = [];
  for (const [id, marker] of flows) {
    if (flowAncestorOf(id, flows)) {
      errors.push(`${prefix}${id}/flow.yaml: a flow is one level deep — a step cannot be a flow`);
      continue;
    }
    const steps = stepsByFlow.get(id);
    if (!steps || steps.length === 0) {
      errors.push(`${prefix}${id}/flow.yaml: a flow with no steps — add a step, or drop the file`);
      continue;
    }
    entries.push({
      ...coordsOf(id.split('/')),
      title: marker.title,
      order: marker.order ?? Math.min(...steps.map((s) => s.order)),
      steps: steps.toSorted(byOrder),
      flowButtons: steps.every((s) => s.flowButtons !== false),
      experiments: [],
    });
  }
  return entries;
}

/**
 * One id names one screen. It may not be claimed twice — a file and a flow
 * folder of the same name — nor be both a screen and a folder others sit in:
 * `finance/accounts` cannot be a file and the group holding
 * `finance/accounts/*` at once.
 */
function reportPathCollisions(entries: ScreenEntry[], prefix: string, errors: string[]): void {
  const ids = new Set(entries.map((e) => e.id));
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      errors.push(`${prefix}${entry.id}: screen id is both a file and a flow folder — choose one`);
    }
    seen.add(entry.id);
  }
  for (const entry of entries) {
    const parents = entry.id.split('/').slice(0, -1);
    for (let depth = 2; depth <= parents.length; depth += 1) {
      const parent = parents.slice(0, depth).join('/');
      if (ids.has(parent)) {
        errors.push(`${prefix}${parent}: screen id is both a file and a folder — choose one`);
      }
    }
  }
}

export interface CollectScreensArgs {
  /** Every `<prefix><path…>.tsx` module, at any depth. */
  modules: Modules;
  /** Every `<prefix><path…>/flow.yaml`, raw — the marker that makes a folder a flow. */
  flowMarkers: Record<string, string>;
  /** `src`-relative directory the screens live under, with trailing slash. */
  prefix: string;
  errors: string[];
}

/**
 * Discover the screens under `prefix`. A `.tsx` file is a screen at its own
 * path; the folders above it nest the sidebar and nothing else — unless a
 * folder declares itself a flow with a `flow.yaml`, in which case the files in
 * it are that flow's ordered steps. Every violation is collected, never thrown.
 */
export function collectScreens({
  modules,
  flowMarkers,
  prefix,
  errors,
}: CollectScreensArgs): ScreenEntry[] {
  const flows = collectFlowMarkers(flowMarkers, prefix, errors);
  const { leaves, stepsByFlow } = sortModules(modules, flows, prefix, errors);
  const entries = [...leaves, ...buildFlows(flows, stepsByFlow, prefix, errors)];
  reportPathCollisions(entries, prefix, errors);
  return entries.toSorted(byOrder);
}
