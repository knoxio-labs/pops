import { z } from 'zod';

/** Lifecycle of one proposed write inside an `actions` part. Closed: bfm validates with it before emitting. */
export const MobileEgoActionStatusSchema = z.enum([
  'pending',
  'confirmed',
  'rejected',
  'executed',
  'failed',
]);

export type MobileEgoActionStatus = z.infer<typeof MobileEgoActionStatusSchema>;

const MobileEgoActionSchema = z.object({
  actionId: z.string(),
  tool: z.string(),
  summary: z.string(),
  status: MobileEgoActionStatusSchema,
});

/**
 * One piece of an Ego message, closed. bfm validates parts with this before
 * emitting; the OpenAPI document carries the open `MobileEgoWirePartSchema`
 * instead, because a generated Swift client decodes a whole payload or none of
 * it. `subtitle` is optional and never null.
 */
export const MobileEgoMessagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('entity'),
    uri: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
  }),
  z.object({
    type: z.literal('actions'),
    batchId: z.string(),
    actions: z.array(MobileEgoActionSchema).min(1),
  }),
]);

export type MobileEgoMessagePart = z.infer<typeof MobileEgoMessagePartSchema>;

/** One frame of the Ego stream as the phone receives it, closed. */
export const MobileEgoStreamFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    name: z.string(),
    status: z.enum(['started', 'finished', 'failed']),
  }),
  z.object({ type: z.literal('part'), part: MobileEgoMessagePartSchema }),
  z.object({ type: z.literal('navigate'), uri: z.string() }),
  z.object({
    type: z.literal('done'),
    conversationId: z.string(),
    messageId: z.string(),
    parts: z.array(MobileEgoMessagePartSchema),
  }),
  z.object({ type: z.literal('error'), message: z.string(), retryable: z.boolean() }),
]);

export type MobileEgoStreamFrame = z.infer<typeof MobileEgoStreamFrameSchema>;

/**
 * Keeps the entries of `raw` that parse as a known part and drops the rest, so
 * a part kind the phone does not know never reaches it. A null `subtitle` is
 * treated as absent before parsing.
 */
export function filterKnownParts(raw: readonly unknown[]): MobileEgoMessagePart[] {
  const parts: MobileEgoMessagePart[] = [];
  for (const entry of raw) {
    const parsed = MobileEgoMessagePartSchema.safeParse(withoutNullSubtitle(entry));
    if (parsed.success) parts.push(parsed.data);
  }
  return parts;
}

function withoutNullSubtitle(entry: unknown): unknown {
  if (typeof entry !== 'object' || entry === null || !('subtitle' in entry)) return entry;
  if (entry.subtitle !== null) return entry;
  const { subtitle: _subtitle, ...rest } = entry;
  return rest;
}

/** Open counterpart of one action: plain strings, safe to widen server-side. */
export const MobileEgoWireActionSchema = z.object({
  actionId: z.string(),
  tool: z.string(),
  summary: z.string(),
  status: z.string(),
});

/** Open counterpart of a message part: one flat object every closed part satisfies. */
export const MobileEgoWirePartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  uri: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  batchId: z.string().optional(),
  actions: z.array(MobileEgoWireActionSchema).optional(),
});

/** One persisted Ego message with open parts. */
export const MobileEgoMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  parts: z.array(MobileEgoWirePartSchema),
  createdAt: z.string(),
});

/** Summary row of one Ego conversation. */
export const MobileEgoConversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A page of conversations and the total count. */
export const MobileEgoConversationPageSchema = z.object({
  conversations: z.array(MobileEgoConversationSchema),
  total: z.number(),
});

/** A conversation with its messages. */
export const MobileEgoThreadSchema = z.object({
  conversation: MobileEgoConversationSchema,
  messages: z.array(MobileEgoMessageSchema),
});

const NonEmptyIdsSchema = z.array(z.string().min(1));

/** Decision on a paused batch: which actions to run, drop, or always allow per tool. */
export const MobileEgoBatchDecisionBodySchema = z.object({
  approve: NonEmptyIdsSchema,
  reject: NonEmptyIdsSchema,
  alwaysAllow: NonEmptyIdsSchema,
});

export type MobileEgoBatchDecisionBody = z.infer<typeof MobileEgoBatchDecisionBodySchema>;

/** Acknowledgement that a batch decision was recorded. */
export const MobileEgoBatchOutcomeSchema = z.object({ batchId: z.string() });

export type MobileEgoBatchOutcome = z.infer<typeof MobileEgoBatchOutcomeSchema>;

/** Where in the app the user was when they sent the message. */
export const MobileEgoAppContextSchema = z.object({
  app: z.string().min(1),
  uri: z.string().optional(),
  route: z.string().optional(),
  entityTitle: z.string().optional(),
});

/** Body of a new user message on the stream route. */
export const MobileEgoChatBodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
  appContext: MobileEgoAppContextSchema.optional(),
});

/** Continues a paused turn once its batch has been decided. */
export const MobileEgoResumeBodySchema = z.object({
  conversationId: z.string().min(1),
  resumeBatchId: z.string().min(1),
});

/** The whole body of the stream route: a new message or a resume. */
export const MobileEgoStreamBodySchema = z.union([
  MobileEgoChatBodySchema,
  MobileEgoResumeBodySchema,
]);

export type MobileEgoChatBody = z.infer<typeof MobileEgoChatBodySchema>;
export type MobileEgoResumeBody = z.infer<typeof MobileEgoResumeBodySchema>;
export type MobileEgoStreamBody = z.infer<typeof MobileEgoStreamBodySchema>;
