#!/usr/bin/env node
/**
 * Scaffold a design experiment, or a variant inside one.
 *
 * The mechanics only. Deciding *what* the experiment asks and how the variants
 * differ is the `design-new-experiment` skill's job; this exists so that part
 * is never spent on remembering where a directory goes or what
 * `experiment.yaml` requires. Everything it writes is what the registry's
 * schema and lineage rules already demand — one active experiment per screen,
 * a `screen` that resolves, a variant per subdirectory.
 *
 * Usage:
 *   node scripts/design-new-experiment.mjs <id> --screen <area>/…/<slug> \
 *     --name "Display name" --question "..." --variant a --variant b
 *   node scripts/design-new-experiment.mjs <id> --variant <variantId>   add to an existing one
 *
 * The pure half (`parseArgs`, `planScaffold`, the renderers) is covered by
 * `scripts/__tests__/design-new-experiment.test.ts` — there is no `--self-test`
 * here because this is a scaffolder, not a guard, and a self-test nothing runs
 * is a test that cannot fail.
 *
 * Refuses to overwrite: an existing experiment or variant is an error, not a
 * silent clobber of someone's work in progress.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, stringify } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

export const EXPERIMENTS_DIR = 'pillars/design/src/experiments';
export const SCREENS_DIR = 'pillars/design/src/screens';

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SCREEN_RE = /^[^/\s]+(?:\/[^/\s]+)+$/u;

/**
 * @typedef {object} Options
 * @property {string} id
 * @property {string[]} variants
 * @property {string} [screen]
 * @property {string} [name]
 * @property {string} [question]
 */

/**
 * @param {readonly string[]} argv
 * @returns {{ kind: 'scaffold', options: Options } | { kind: 'error', message: string }}
 */
export function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  /** @type {Options} */
  const options = { id: '', variants: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return { kind: 'error', message: `${flag} needs a value` };
    }
    if (flag === '--variant') options.variants.push(value);
    else if (flag === '--screen') options.screen = value;
    else if (flag === '--name') options.name = value;
    else if (flag === '--question') options.question = value;
    else return { kind: 'error', message: `unknown option ${flag}` };
    i += 1;
  }
  const id = positional[0];
  if (id === undefined) return { kind: 'error', message: 'an experiment id is required' };
  if (!ID_RE.test(id)) {
    return { kind: 'error', message: `experiment id must be kebab-case: ${id}` };
  }
  if (options.variants.length === 0) {
    return { kind: 'error', message: 'at least one --variant is required' };
  }
  const badVariant = options.variants.find((v) => !ID_RE.test(v));
  if (badVariant !== undefined) {
    return { kind: 'error', message: `variant id must be kebab-case: ${badVariant}` };
  }
  if (options.screen !== undefined && !SCREEN_RE.test(options.screen)) {
    return { kind: 'error', message: `--screen must be <area>/…/<slug>: ${options.screen}` };
  }
  return { kind: 'scaffold', options: { ...options, id } };
}

/**
 * The `experiment.yaml` for a new experiment. Only the fields the schema
 * requires plus the two that make it readable; `chosen`, `decided` and
 * `rationale` are written when it is decided, not before.
 *
 * @param {Options} options
 * @returns {string}
 */
export function renderExperimentYaml(options) {
  /** @type {Record<string, unknown>} */
  const data = { name: options.name ?? options.id };
  if (options.question !== undefined) data.question = options.question;
  data.status = 'active';
  data.screen = options.screen ?? '';
  data.variants = Object.fromEntries(options.variants.map((variant) => [variant, variant]));
  return stringify(data);
}

/**
 * A variant's starting screen file: a copy of the main screen when there is
 * one, so the first diff a reviewer sees is the change being proposed rather
 * than a blank page. Without a main screen it is a stub that says so.
 *
 * @param {string} screenId
 * @param {string | undefined} mainSource
 * @returns {string}
 */
export function renderVariantScreen(screenId, mainSource) {
  if (mainSource !== undefined) return mainSource;
  const title = screenId.split('/').at(-1) ?? screenId;
  return `import type { ScreenMeta } from '@/contract';

export const meta: ScreenMeta = { title: '${title}' };

export default function Screen() {
  return <p className="p-8 text-muted-foreground">Nothing here yet.</p>;
}
`;
}

/**
 * Every file the scaffold writes, as path → contents. Pure, so the tests drive
 * it without touching the tree.
 *
 * `readExperimentYaml` is absent for an experiment that does not exist yet,
 * and is how an existing one's screen is read back when only a variant is
 * being added.
 *
 * @param {Options} options
 * @param {{ experimentExists: boolean, variantExists: (id: string) => boolean, readExperimentYaml?: () => string | undefined, readMainScreen: (screenId: string) => string | undefined }} tree
 * @returns {{ ok: true, files: Record<string, string> } | { ok: false, reason: string }}
 */
export function planScaffold(options, tree) {
  const screen = options.screen;
  /** @type {Record<string, string>} */
  const files = {};
  if (!tree.experimentExists) {
    if (screen === undefined) {
      return { ok: false, reason: 'a new experiment needs --screen <area>/…/<slug>' };
    }
    files[`${EXPERIMENTS_DIR}/${options.id}/experiment.yaml`] = renderExperimentYaml(options);
  } else if (options.screen !== undefined) {
    return {
      ok: false,
      reason: `experiment "${options.id}" already exists — drop --screen and pass only --variant`,
    };
  }

  for (const variant of options.variants) {
    if (tree.variantExists(variant)) {
      return { ok: false, reason: `variant "${variant}" already exists in "${options.id}"` };
    }
  }

  const targetScreen = screen ?? readExperimentScreen(tree);
  if (targetScreen === undefined) {
    return { ok: false, reason: `cannot tell which screen "${options.id}" explores` };
  }
  for (const variant of options.variants) {
    const path = `${EXPERIMENTS_DIR}/${options.id}/variants/${variant}/screens/${targetScreen}.tsx`;
    files[path] = renderVariantScreen(targetScreen, tree.readMainScreen(targetScreen));
  }
  return { ok: true, files };
}

/**
 * The screen an existing experiment explores, read back out of its
 * `experiment.yaml` so adding a variant needs only the experiment's id.
 *
 * Parsed rather than pattern-matched: the writer quotes whatever needs it, so
 * a regex over the raw text reads the quotes back as part of the value, and a
 * `screen` nested under another key would match a line it does not own.
 *
 * @param {{ readExperimentYaml?: () => string | undefined }} tree
 * @returns {string | undefined}
 */
function readExperimentScreen(tree) {
  const source = tree.readExperimentYaml?.();
  if (source === undefined) return undefined;
  /** @type {unknown} */
  let document;
  try {
    document = parse(source);
  } catch {
    return undefined;
  }
  if (typeof document !== 'object' || document === null) return undefined;
  const screen = /** @type {Record<string, unknown>} */ (document)['screen'];
  return typeof screen === 'string' && screen !== '' ? screen : undefined;
}

function treeReader(/** @type {string} */ id) {
  const experimentDir = join(repoRoot, EXPERIMENTS_DIR, id);
  const yamlPath = join(experimentDir, 'experiment.yaml');
  return {
    experimentExists: existsSync(yamlPath),
    variantExists: (/** @type {string} */ variant) =>
      existsSync(join(experimentDir, 'variants', variant)),
    readExperimentYaml: () => (existsSync(yamlPath) ? readFileSync(yamlPath, 'utf8') : undefined),
    readMainScreen: (/** @type {string} */ screenId) => {
      const path = join(repoRoot, SCREENS_DIR, `${screenId}.tsx`);
      return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
    },
  };
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === 'error') {
    console.error(`design-new-experiment: ${parsed.message}`);
    process.exit(2);
  }
  const plan = planScaffold(parsed.options, treeReader(parsed.options.id));
  if (!plan.ok) {
    console.error(`design-new-experiment: ${plan.reason}`);
    process.exit(1);
  }
  for (const [relPath, contents] of Object.entries(plan.files)) {
    const target = join(repoRoot, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    console.log(`wrote ${relPath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
