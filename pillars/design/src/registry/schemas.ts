import { z } from 'zod';

import { FRAME_KINDS } from '../frames/kind';

import type { ComponentType } from 'react';

import type { ScreenMeta } from '../contract';

/** `experiments/<id>/experiment.yaml` — the facts the tree cannot express. */
export const experimentYamlSchema = z.object({
  name: z.string().min(1),
  question: z.string().optional(),
  status: z.enum(['active', 'decided', 'archived']),
  /** The screen id (`<area>/<slug>`) this experiment explores. Required: every
   *  experiment belongs to a screen, even one that exists only in its variants. */
  screen: z.string().regex(/^[^/]+\/[^/]+$/u, 'must be <area>/<slug>'),
  /** Display names per variant id; a variant without one shows its id. */
  variants: z.record(z.string(), z.string()).optional(),
  chosen: z.string().optional(),
  decided: z.string().optional(),
  rationale: z.string().optional(),
  /** Product chrome for every variant of this experiment, when the question
   *  is about a surface that only makes sense inside one. A variant screen's
   *  own `meta.frame` still wins. */
  frame: z.enum(FRAME_KINDS).optional(),
});

export const screenMetaSchema: z.ZodType<ScreenMeta> = z.object({
  title: z.string().min(1),
  order: z.number().optional(),
  flowButtons: z.boolean().optional(),
  frame: z.enum(FRAME_KINDS).optional(),
});

/**
 * The optional colocated `states` export: a map of state id → render thunk.
 * Each value must be a function; the default render is the implicit
 * `default` state and is never listed here.
 */
export const statesSchema = z.record(
  z.string().min(1),
  z.custom<ComponentType>((value) => typeof value === 'function', 'must be a render function')
);
