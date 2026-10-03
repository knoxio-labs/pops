/**
 * Wire definition of `POST /ego/chat/stream`. That endpoint is not a ts-rest
 * route (ts-rest cannot model `text/event-stream`), so these schemas are its
 * only definition: `egoStreamBodySchema` for the request and
 * `egoStreamFrameSchema` for each server-sent frame.
 *
 * A `part` frame whose part is an `actions` part with a `batchId` the client
 * already holds updates that card's statuses in place; any other `part` frame
 * is a new part. The resumed stream sends such updates while it runs the
 * approved writes, and a message turn that settles an open batch sends them
 * first.
 */
import { z } from 'zod';

import { egoMessagePartSchema, egoMessagePartsSchema, egoUriSchema } from './rest-ego-parts.js';
import {
  egoChannelSchema,
  egoChatBodySchema,
  retrievedEngramWire,
  scopeNegotiationWire,
} from './rest-ego-schemas.js';

/** One server-sent frame of the Ego stream, discriminated on `type`. */
export const egoStreamFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({
    type: z.literal('tool'),
    name: z.string().min(1),
    status: z.enum(['started', 'finished', 'failed']),
  }),
  z.object({ type: z.literal('part'), part: egoMessagePartSchema }),
  z.object({ type: z.literal('navigate'), uri: egoUriSchema }),
  z.object({
    type: z.literal('done'),
    conversationId: z.string(),
    messageId: z.string(),
    citations: z.array(z.string()),
    tokensIn: z.number(),
    tokensOut: z.number(),
    retrievedEngrams: z.array(retrievedEngramWire),
    scopeNegotiation: scopeNegotiationWire,
    parts: egoMessagePartsSchema,
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    retryable: z.boolean(),
    conversationId: z.string().optional(),
  }),
]);

/** Body that continues a paused turn once its batch has been decided. */
export const egoResumeBodySchema = z.object({
  conversationId: z.string().min(1),
  resumeBatchId: z.string().min(1),
  channel: egoChannelSchema.optional(),
});

/** The whole body of `POST /ego/chat/stream`: a new message or a resume. */
export const egoStreamBodySchema = z.union([egoChatBodySchema, egoResumeBodySchema]);

export type EgoStreamFrame = z.infer<typeof egoStreamFrameSchema>;
export type EgoResumeBody = z.infer<typeof egoResumeBodySchema>;
export type EgoStreamBody = z.infer<typeof egoStreamBodySchema>;
