import type { ExperimentEntry, ScreenEntry } from './types';

/**
 * Attach each experiment to the screen it explores and enforce the
 * cross-reference rules. An experiment's `screen` must resolve to a main
 * screen or to one introduced by its own variants; an unresolved one is a
 * contract error. At most one ACTIVE experiment may sit on a given screen —
 * two would make "which design am I looking at" ambiguous in the sidebar.
 * Mutates the matching `screens[].experiments` and appends any errors.
 */
export function linkExperimentsToScreens(
  screens: ScreenEntry[],
  experiments: ExperimentEntry[],
  errors: string[]
): void {
  const mainScreens = new Map(screens.map((s) => [s.id, s]));
  const owner = new Map<string, string>();

  for (const exp of experiments) {
    const variantScreens = exp.variants.flatMap((v) => v.screens);
    const resolves = mainScreens.has(exp.screen) || variantScreens.some((s) => s.id === exp.screen);
    if (!resolves) {
      errors.push(
        `experiments/${exp.id}: screen "${exp.screen}" matches no main screen or screen in this experiment's variants`
      );
      continue;
    }
    mainScreens.get(exp.screen)?.experiments.push(exp);

    if (exp.status !== 'active') continue;
    const prior = owner.get(exp.screen);
    if (prior === undefined) {
      owner.set(exp.screen, exp.id);
    } else {
      errors.push(
        `experiments/${exp.id}: screen "${exp.screen}" already hosts active experiment "${prior}" — at most one active experiment per screen`
      );
    }
  }
}
