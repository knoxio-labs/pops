/**
 * tRPC router for cerebrum.query (PRD-082).
 *
 * Procedures:
 *   ask      — full NL Q&A pipeline (mutation — calls LLM, has side effects)
 *   retrieve — retrieval-only, no LLM (query)
 *   explain  — debug: show scope inference + retrieval plan (query)
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpError, NotFoundError, ValidationError } from '../../../shared/errors.js';
import { protectedProcedure, router } from '../../../trpc.js';
import { QueryService } from './query-service.js';

import type { QueryDomain } from './types.js';

function toTrpcError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ValidationError) {
    const details = err.details;
    let message: string;
    if (typeof details === 'string') {
      message = details;
    } else if (
      typeof details === 'object' &&
      details !== null &&
      typeof (details as { message?: unknown }).message === 'string'
    ) {
      message = (details as { message: string }).message;
    } else {
      message = err.message;
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message, cause: err });
  }
  if (err instanceof HttpError) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
  throw err;
}

function getService(): QueryService {
  return new QueryService();
}

const domainEnum = z.enum(['engrams', 'transactions', 'media', 'inventory']);

const queryRequestSchema = z.object({
  question: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  includeSecret: z.boolean().optional(),
  maxSources: z.number().int().positive().max(50).optional(),
  domains: z.array(domainEnum).optional(),
});

const retrieveSchema = z.object({
  question: z.string().min(1),
  scopes: z.array(z.string().min(1)).optional(),
  includeSecret: z.boolean().optional(),
  maxSources: z.number().int().positive().max(50).optional(),
});

const explainSchema = z.object({
  question: z.string().min(1),
});

export const queryRouter = router({
  /** Full NL Q&A pipeline: scope inference → retrieval → LLM → citation parsing. */
  ask: protectedProcedure.input(queryRequestSchema).mutation(async ({ input }) => {
    try {
      return await getService().ask({
        question: input.question,
        scopes: input.scopes,
        includeSecret: input.includeSecret,
        maxSources: input.maxSources,
        domains: input.domains as QueryDomain[] | undefined,
      });
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Retrieval-only — returns sources without calling the LLM. */
  retrieve: protectedProcedure.input(retrieveSchema).query(async ({ input }) => {
    try {
      return await getService().retrieve(
        input.question,
        input.scopes,
        input.includeSecret,
        input.maxSources
      );
    } catch (err) {
      toTrpcError(err);
    }
  }),

  /** Debug: show scope inference and retrieval plan without executing. */
  explain: protectedProcedure.input(explainSchema).query(({ input }) => {
    try {
      return getService().explain(input.question);
    } catch (err) {
      toTrpcError(err);
    }
  }),
});
