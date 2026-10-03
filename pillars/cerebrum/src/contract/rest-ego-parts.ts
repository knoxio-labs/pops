import { z } from 'zod';

/**
 * Matches an ADR-012 object URI, `pops:{domain}/{type}/{id}`. Domain and type
 * are lowercase kebab-case; the id is the last segment, non-empty, with no
 * slash or whitespace.
 */
export const EGO_URI_PATTERN = /^pops:([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\/([^/\s]+)$/;

/** A string that is a well-formed ADR-012 object URI. */
export const egoUriSchema = z.string().regex(EGO_URI_PATTERN);

/**
 * Splits an object URI into its domain, type and id segments, or returns null
 * when the string is not a well-formed URI.
 */
export function parseObjectUri(uri: string): { domain: string; type: string; id: string } | null {
  const match = EGO_URI_PATTERN.exec(uri);
  if (!match) return null;
  const [, domain, type, id] = match;
  if (domain === undefined || type === undefined || id === undefined) return null;
  return { domain, type, id };
}

/** Plain assistant text. */
export const egoTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/** A reference to an entity that clients render as a native card for its URI type. */
export const egoEntityPartSchema = z.object({
  type: z.literal('entity'),
  uri: egoUriSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
});

/** Lifecycle of one proposed write inside a batch. */
export const egoActionStatusSchema = z.enum([
  'pending',
  'confirmed',
  'rejected',
  'executed',
  'failed',
]);

/** One proposed or already executed write inside a batch. */
export const egoBatchActionSchema = z.object({
  actionId: z.string().min(1),
  tool: z.string().min(1),
  summary: z.string(),
  status: egoActionStatusSchema,
});

/** One batch of proposed or already executed writes; there is no per-action part. */
export const egoActionsPartSchema = z.object({
  type: z.literal('actions'),
  batchId: z.string().min(1),
  actions: z.array(egoBatchActionSchema).min(1),
});

/** Any part a message can carry, discriminated on `type`. */
export const egoMessagePartSchema = z.discriminatedUnion('type', [
  egoTextPartSchema,
  egoEntityPartSchema,
  egoActionsPartSchema,
]);

/** The ordered parts of one message. */
export const egoMessagePartsSchema = z.array(egoMessagePartSchema);

export type EgoTextPart = z.infer<typeof egoTextPartSchema>;
export type EgoEntityPart = z.infer<typeof egoEntityPartSchema>;
export type EgoBatchAction = z.infer<typeof egoBatchActionSchema>;
export type EgoActionsPart = z.infer<typeof egoActionsPartSchema>;
export type EgoActionStatus = z.infer<typeof egoActionStatusSchema>;
export type EgoMessagePart = z.infer<typeof egoMessagePartSchema>;
