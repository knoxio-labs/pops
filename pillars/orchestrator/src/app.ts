/**
 * Express app factory for the orchestrator container.
 *
 * Precursor C2 (ADR-029, epics 06+07) stands up the foundation: the
 * minimal `/health` liveness probe plus the federated `/pillars` view
 * (registry-first via the SDK discovery client, `POPS_PILLARS` seed
 * fallback). Federated search, the AI-tool registry, and shared-tag lookup
 * mount here alongside the health and registry views.
 *
 * Kept as a factory so the test suite can spin up an in-process
 * `supertest` instance without binding a real port.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints, initServer } from '@ts-rest/express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import { createPillarErrorHandlers, defineErrors } from '@pops/pillar-express';

import { type BuildToolList, createAiToolsHandler } from './ai-tools/index.js';
import { orchestratorContract } from './contract/rest.js';
import { type OrchestratorDeps, makeRequestHandler } from './handlers.js';
import { runSearch, type SearchSource } from './search/index.js';
import {
  createTagFederation,
  type TagFederationRequest,
  type TagFederationResponse,
} from './tags/federation.js';

const server: ReturnType<typeof initServer> = initServer();
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi', 'orchestrator.openapi.json'),
    'utf8'
  )
);

const JSON_BODY_LIMIT = '512kb';

const orchestratorErrors = defineErrors('orchestrator', {
  invalid: {
    area: 'request',
    status: 400,
    message: 'The search request is invalid.',
    retryable: false,
  },
  failed: {
    area: 'search',
    status: 500,
    message: 'Search could not be completed.',
    retryable: true,
  },
  unavailable: {
    area: 'tagged',
    status: 503,
    message: 'The shared-tag query could not be completed.',
    retryable: true,
  },
});

/**
 * Body of `POST /search`. Mirrors each pillar's `/search` envelope
 * (`{ query: { text, filters? }, context? }`) so the orchestrator's federated
 * endpoint is wire-compatible with the per-pillar endpoints it fans out to —
 * the frontend `core.search` repoint (follow-up increment) swaps the target
 * URL without reshaping the request.
 */
const SearchRequestSchema = z.object({
  query: z.object({
    text: z.string(),
    filters: z
      .array(z.object({ field: z.string(), operator: z.string(), value: z.string() }))
      .optional(),
  }),
  context: z
    .object({
      app: z.string().nullable(),
      page: z.string().nullable(),
      entity: z.object({ uri: z.string(), type: z.string(), title: z.string() }).optional(),
      filters: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

export interface CreateOrchestratorAppOptions {
  /**
   * Federated-search hit source override. Production omits this so the route
   * uses the live federation source; tests inject a stub to avoid network /
   * service-account auth.
   */
  readonly searchSource?: SearchSource;
  /**
   * AI-tool registry aggregator override. Production omits this so
   * `GET /ai/tools` uses the SDK's `buildToolList` over the live discovery
   * cache; tests inject a stub to assert the projected tools without a
   * registry round-trip.
   */
  readonly buildToolList?: BuildToolList;
  /** Shared-tag query override. Production uses the live tag federation. */
  readonly taggedQuerySource?: (request: TagFederationRequest) => Promise<TagFederationResponse>;
}

function createTaggedQueryHandlers(
  taggedQuery: (request: TagFederationRequest) => Promise<TagFederationResponse>
): ReturnType<typeof server.router<typeof orchestratorContract>> {
  return server.router(orchestratorContract, {
    tagged: {
      query: async ({ body }) => {
        try {
          const result = await taggedQuery(body);
          return {
            status: 200 as const,
            body: {
              expandedTagIds: result.expandedTagIds,
              sections: result.sections.map(({ pillarId, ...section }) => ({
                pillar: pillarId,
                ...section,
              })),
              pillars: result.pillars.map(({ pillarId, status }) => ({ id: pillarId, status })),
            },
          };
        } catch {
          return orchestratorErrors.unavailable();
        }
      },
    },
  });
}

export function createOrchestratorApp(
  deps: OrchestratorDeps,
  options: CreateOrchestratorAppOptions = {}
): Express {
  const app = express();
  const errors = createPillarErrorHandlers({ pillar: 'orchestrator' });
  app.disable('x-powered-by');
  app.use(errors.requestId);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(errors.bodyParser);

  const handlers = makeRequestHandler(deps);
  const aiTools = createAiToolsHandler(
    options.buildToolList !== undefined ? { buildToolList: options.buildToolList } : {}
  );
  const taggedQuery = options.taggedQuerySource ?? createTagFederation();
  const taggedQueryHandlers = createTaggedQueryHandlers(taggedQuery);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  app.get('/pillars', (_req: Request, res: Response, next: NextFunction) => {
    void handlers
      .pillars()
      .then((payload) => res.json(payload))
      .catch(next);
  });

  app.post('/search', (req: Request, res: Response, next: NextFunction) => {
    void handleSearch(req, res, options.searchSource).catch(next);
  });

  app.get('/ai/tools', (_req: Request, res: Response, next: NextFunction) => {
    void aiTools()
      .then((payload) => res.json(payload))
      .catch(next);
  });

  createExpressEndpoints(orchestratorContract, taggedQueryHandlers, app, {
    requestValidationErrorHandler: errors.validation,
  });

  app.use(errors.notFound);
  app.use(errors.final);

  return app;
}

async function handleSearch(
  req: Request,
  res: Response,
  searchSource: SearchSource | undefined
): Promise<void> {
  const parsed = SearchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return orchestratorErrors.invalid({ issues: parsed.error.issues });
  }

  const { query, context } = parsed.data;
  try {
    const result = await runSearch({
      text: query.text,
      ...(context !== undefined ? { context } : {}),
      ...(searchSource !== undefined ? { source: searchSource } : {}),
    });
    res.json(result);
  } catch (err) {
    console.error('[orchestrator] federated search failed', err);
    return orchestratorErrors.failed();
  }
}
