import { escapeRegExp, parseYamlFile, srcRelative } from './paths';
import { experimentYamlSchema } from './schemas';
import { collectScreens } from './screens';

import type { ExperimentEntry, VariantEntry } from './types';

type Modules = Record<string, Record<string, unknown>>;

export interface ExperimentSources {
  /** `experiments/<id>/experiment.yaml`, raw text. */
  yamls: Record<string, string>;
  /** `experiments/<id>/variants/<v>/screens/<area>/<slug>.tsx`. */
  leafModules: Modules;
  /** `experiments/<id>/variants/<v>/screens/<area>/<flow>/<step>.tsx`. */
  flowModules: Modules;
  /** One level deeper than a flow step — always an error. */
  deepModules: Modules;
}

const EXPERIMENT_YAML_RE = /^experiments\/([^/]+)\/experiment\.yaml$/u;

/** Variant ids under one experiment, from whichever module set mentions them. */
function variantIdsOf(expId: string, sources: ExperimentSources): string[] {
  const re = new RegExp(`^experiments/${escapeRegExp(expId)}/variants/([^/]+)/`, 'u');
  const ids = new Set<string>();
  for (const key of [
    ...Object.keys(sources.leafModules),
    ...Object.keys(sources.flowModules),
    ...Object.keys(sources.deepModules),
  ]) {
    const id = srcRelative(key).match(re)?.[1];
    if (id) ids.add(id);
  }
  return [...ids].toSorted();
}

function collectVariants(
  expId: string,
  names: Record<string, string> | undefined,
  sources: ExperimentSources,
  errors: string[]
): VariantEntry[] {
  return variantIdsOf(expId, sources).map((variantId) => ({
    id: variantId,
    name: names?.[variantId] ?? variantId,
    screens: collectScreens({
      leafModules: sources.leafModules,
      flowModules: sources.flowModules,
      deepModules: sources.deepModules,
      prefix: `experiments/${expId}/variants/${variantId}/screens/`,
      errors,
    }),
  }));
}

/**
 * Discover every experiment: its YAML facts plus the variants the tree
 * realises. An experiment without variants, or whose `chosen` names a variant
 * that does not exist, is a contract error but still listed.
 */
export function discoverExperiments(
  sources: ExperimentSources,
  errors: string[]
): ExperimentEntry[] {
  const experiments: ExperimentEntry[] = [];
  for (const [globPath, raw] of Object.entries(sources.yamls)) {
    const path = srcRelative(globPath);
    const expId = path.match(EXPERIMENT_YAML_RE)?.[1];
    if (!expId) continue;
    const parsed = parseYamlFile(raw, experimentYamlSchema, path, errors);
    if (!parsed) continue;

    const variants = collectVariants(expId, parsed.variants, sources, errors);
    if (variants.length === 0) {
      errors.push(`experiments/${expId}: no variants — an experiment always has variants/`);
    }
    if (parsed.chosen && !variants.some((v) => v.id === parsed.chosen)) {
      errors.push(`experiments/${expId}: chosen variant "${parsed.chosen}" does not exist`);
    }

    experiments.push({
      id: expId,
      name: parsed.name,
      question: parsed.question,
      status: parsed.status,
      screen: parsed.screen,
      chosen: parsed.chosen,
      rationale: parsed.rationale,
      variants,
    });
  }
  return experiments.toSorted((a, b) => a.id.localeCompare(b.id));
}
