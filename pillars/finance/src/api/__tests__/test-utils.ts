/**
 * Supertest-backed REST client for the finance integration tests.
 *
 * Preserves a caller-shaped API (`client.wishlist.create({...})`,
 * `client.budgets.list()`) so per-test bodies stay readable — only the
 * transport changed. Non-2xx responses throw `HttpError` with the parsed
 * `{ status, body }` so tests assert on `.rejects.toMatchObject({ status })`.
 *
 * Transport: one shared server per test module, pre-listened and bound
 * explicitly to `127.0.0.1` — not the `::` wildcard supertest's own
 * `app.listen(0)` would use (#3754), since a `::`-bound server does not own
 * the IPv4 loopback tuple supertest dials — plus one keep-alive agent so TCP
 * connections are pooled across requests (superagent defaults to
 * `agent: false`, a fresh connection per request). The suite previously
 * opened a fresh server AND a fresh connection for every API call, burning
 * two ephemeral ports each; under full-suite parallelism macOS's loopback
 * port allocator intermittently stalled `connect(2)` for >5s (netstat shows
 * the client socket stuck in CLOSED with no local port assigned while the
 * server listens with zero connections), surfacing as random
 * `Test timed out in 5000ms` failures in whichever file drew the short
 * straw. The shared server dispatches to the most recently supplied app and
 * is `unref`ed and never closed: vitest's per-file module isolation scopes
 * it to the file, and worker teardown reclaims it.
 */
import { once } from 'node:events';
import http from 'node:http';

import supertest from 'supertest';

import type { AddressInfo } from 'node:net';

import type { Express } from 'express';

import type { ChangeSet } from '../../contract/rest-corrections-schemas.js';
import type { Account } from '../modules/accounts-types.js';
import type { Budget } from '../modules/budgets-types.js';
import type { Currency } from '../modules/currencies-types.js';
import type { ImportProgress } from '../modules/imports/index.js';
import type {
  CommitResult,
  CreateEntityOutput,
  ProcessImportOutput,
} from '../modules/imports/types.js';
import type { Institution } from '../modules/institutions-types.js';
import type { SuggestedTag } from '../modules/tag-suggester/index.js';
import type { Transaction } from '../modules/transactions-types.js';
import type { WishListItem } from '../modules/wishlist-types.js';

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

const keepAliveAgent = new http.Agent({ keepAlive: true });

async function send<T>(req: supertest.Test): Promise<T> {
  const res = await req.agent(keepAliveAgent);
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw new HttpError(res.status, res.body);
}

type Agent = ReturnType<typeof supertest>;

/**
 * Node ≥19 pools keep-alive sockets, and `server.close()` alone can wait out
 * the server's 5s `keepAliveTimeout` for a socket it failed to flag idle.
 * Every response is fully awaited before teardown, so destroying the
 * remaining sockets is safe.
 */
const closeServer = (server: http.Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });

async function listenOnLoopback(handler: http.RequestListener): Promise<http.Server> {
  const server = http.createServer(handler);
  await once(server.listen(0, '127.0.0.1'), 'listening');
  const addr = server.address() as AddressInfo | null;
  if (addr?.address !== '127.0.0.1') {
    await closeServer(server);
    throw new Error(`finance test server must bind 127.0.0.1, got ${addr?.address ?? 'null'}`);
  }
  return server;
}

let sharedServer: Promise<http.Server> | null = null;
let dispatchApp: Express | null = null;
let inFlight = 0;

async function onDedicatedServer<R>(app: Express, fn: (agent: Agent) => Promise<R>): Promise<R> {
  const server = await listenOnLoopback(app);
  try {
    return await fn(supertest(server));
  } finally {
    await closeServer(server);
  }
}

/**
 * Run `fn` against the module's shared `127.0.0.1` server (see the file
 * header for why it is shared). Requests dispatch to the most recently
 * supplied app — safe because tests await each call and vitest isolates
 * modules per file; the suite's one concurrent pattern (commit idempotency)
 * issues both requests through a single app. Concurrent calls carrying a
 * *different* app fall back to a dedicated throwaway server so a request can
 * never be routed to the wrong app.
 */
async function onServer<R>(app: Express, fn: (agent: Agent) => Promise<R>): Promise<R> {
  if (inFlight > 0 && dispatchApp !== app) return onDedicatedServer(app, fn);
  dispatchApp = app;
  inFlight++;
  try {
    sharedServer ??= listenOnLoopback((req, res) => {
      if (dispatchApp) {
        dispatchApp(req, res);
        return;
      }
      res.statusCode = 500;
      res.end('no app bound to the shared finance test server');
    }).then((server) => {
      server.unref();
      return server;
    });
    const server = await sharedServer;
    return await fn(supertest(server));
  } finally {
    inFlight--;
  }
}

const withServer = <T>(app: Express, build: (agent: Agent) => supertest.Test): Promise<T> =>
  onServer(app, (agent) => send<T>(build(agent)));

/**
 * Issue one request against the shared `127.0.0.1` server and return the raw
 * supertest response — no 2xx unwrapping — for the handful of tests that assert
 * on status/headers directly (health, webhook auth). Same transport as
 * {@link makeClient} (#3754).
 */
export const requestOn = (
  app: Express,
  build: (agent: Agent) => supertest.Test
): Promise<supertest.Response> =>
  onServer(app, async (agent) => build(agent).agent(keepAliveAgent));

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: 'exact' | 'prefix' | 'contains';
  data: Record<string, unknown>;
}

interface TransactionSnapshot {
  id: string;
  notionId: string | null;
  description: string;
  account: string;
  amount: number;
  date: string;
  type: string;
  tags: string;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country: string | null;
  relatedTransactionId: string | null;
  notes: string | null;
  checksum: string | null;
  rawRow: string | null;
  lastEditedTime: string;
}

export interface WishListQuery {
  search?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export interface BudgetQuery {
  search?: string;
  period?: string;
  active?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

export interface TransactionQuery {
  search?: string;
  account?: string;
  startDate?: string;
  endDate?: string;
  tag?: string;
  entityId?: string;
  type?: string;
  limit?: number;
  offset?: number;
  beforeDate?: string;
  beforeId?: string;
}

interface TagSuggestion {
  tag: string;
  source: string;
  pattern?: string;
  isNew?: boolean;
}

interface TagRulePreview {
  counts: {
    affected: number;
    suggestionChanges: number;
    removed: number;
    newTagProposals: number;
  };
  affected: {
    transactionId: string;
    description: string;
    before: { suggestedTags: TagSuggestion[] };
    after: { suggestedTags: TagSuggestion[] };
  }[];
  newTags: string[];
}

interface TagRuleProposal {
  changeSet: { source?: string; reason?: string; ops: unknown[] };
  rationale: string;
  preview: TagRulePreview;
}

interface TagRule {
  id: string;
  descriptionPattern: string;
  matchType: string;
  entityId: string | null;
  tags: string[];
  isActive: boolean;
  confidence: number;
  priority: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

interface Correction {
  id: string;
  descriptionPattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: 'purchase' | 'transfer' | 'income' | null;
  isActive: boolean;
  priority: number;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}

interface PreviewMatchResult {
  matches: {
    id: string;
    description: string;
    account: string;
    amount: number;
    date: string;
    entityName: string | null;
    tags: string[];
  }[];
  total: number;
  scanned: number;
  truncated: boolean;
}

interface RuleMatchPreviewResult {
  matches: {
    id: string;
    checksum: string | null;
    date: string;
    description: string;
    amount: number;
    entityId: string | null;
    entityName: string | null;
  }[];
  totalCount: number;
}

interface TagRuleApplyExistingResult {
  dryRun: boolean;
  matched: number;
  updated: number;
  skippedManual: number;
}

interface CorrectionApplyExistingResult {
  dryRun: boolean;
  matched: number;
  updated: number;
  skippedManual: number;
  skippedUncertain: number;
}

interface CorrectionMatchSummary {
  matched: boolean;
  status: 'matched' | 'uncertain' | null;
  ruleId: string | null;
  confidence: number | null;
}

interface ChangeSetPreviewResult {
  diffs: {
    checksum?: string;
    description: string;
    before: CorrectionMatchSummary;
    after: CorrectionMatchSummary;
    changed: boolean;
  }[];
  summary: {
    total: number;
    newMatches: number;
    removedMatches: number;
    statusChanges: number;
    netMatchedDelta: number;
  };
}

export interface CorrectionListQuery {
  minConfidence?: number;
  matchType?: 'exact' | 'contains' | 'regex';
  limit?: number;
  offset?: number;
}

export interface TagRuleListQuery {
  matchType?: 'exact' | 'contains' | 'regex';
  isActive?: 'true' | 'false';
  minConfidence?: number;
  limit?: number;
  offset?: number;
}

export interface EntityUsage {
  id: string;
  name: string;
  type: string;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
  transactionCount: number;
}

export interface EntityUsageQuery {
  search?: string;
  type?: string;
  orphanedOnly?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

export function makeClient(app: Express) {
  const call = <T>(build: (r: Agent) => supertest.Test): Promise<T> => withServer<T>(app, build);
  return {
    search: {
      run: (body: { query: { text: string; filters?: unknown[] }; context?: unknown }) =>
        call<{ hits: SearchHit[] }>((r) => r.post('/search').send(body)),
    },
    wishlist: {
      list: (query: WishListQuery = {}) =>
        call<{ data: WishListItem[]; pagination: Pagination }>((r) =>
          r.get('/wishlist').query(query)
        ),
      get: (id: string) => call<{ data: WishListItem }>((r) => r.get(`/wishlist/${id}`)),
      create: (body: Record<string, unknown>) =>
        call<{ data: WishListItem; message: string }>((r) => r.post('/wishlist').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        call<{ data: WishListItem; message: string }>((r) => r.patch(`/wishlist/${id}`).send(data)),
      delete: (id: string) => call<{ message: string }>((r) => r.delete(`/wishlist/${id}`)),
    },
    budgets: {
      list: (query: BudgetQuery = {}) =>
        call<{ data: Budget[]; pagination: Pagination }>((r) => r.get('/budgets').query(query)),
      get: (id: string) => call<{ data: Budget }>((r) => r.get(`/budgets/${id}`)),
      create: (body: Record<string, unknown>) =>
        call<{ data: Budget; message: string }>((r) => r.post('/budgets').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        call<{ data: Budget; message: string }>((r) => r.patch(`/budgets/${id}`).send(data)),
      delete: (id: string) => call<{ message: string }>((r) => r.delete(`/budgets/${id}`)),
    },
    currencies: {
      list: () => call<{ data: Currency[] }>((r) => r.get('/currencies')),
      create: (body: Record<string, unknown>) =>
        call<{ data: Currency; message: string }>((r) => r.post('/currencies').send(body)),
      delete: (code: string) => call<{ message: string }>((r) => r.delete(`/currencies/${code}`)),
    },
    institutions: {
      list: () => call<{ data: Institution[] }>((r) => r.get('/institutions')),
      create: (body: Record<string, unknown>) =>
        call<{ data: Institution; message: string }>((r) => r.post('/institutions').send(body)),
      delete: (id: string) => call<{ message: string }>((r) => r.delete(`/institutions/${id}`)),
    },
    accounts: {
      list: () => call<{ data: Account[] }>((r) => r.get('/accounts')),
      get: (id: string) => call<{ data: Account }>((r) => r.get(`/accounts/${id}`)),
      create: (body: Record<string, unknown>) =>
        call<{ data: Account; message: string }>((r) => r.post('/accounts').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        call<{ data: Account; message: string }>((r) => r.patch(`/accounts/${id}`).send(data)),
      delete: (id: string) =>
        call<{ data: Account; message: string }>((r) => r.delete(`/accounts/${id}`)),
    },
    transactions: {
      list: (query: TransactionQuery = {}) =>
        call<{ data: Transaction[]; pagination: Pagination }>((r) =>
          r.get('/transactions').query(query)
        ),
      get: (id: string) => call<{ data: Transaction }>((r) => r.get(`/transactions/${id}`)),
      create: (body: Record<string, unknown>) =>
        call<{ data: Transaction; message: string }>((r) => r.post('/transactions').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        call<{ data: Transaction; message: string }>((r) =>
          r.patch(`/transactions/${id}`).send(data)
        ),
      delete: (id: string) =>
        call<{ message: string; snapshot: TransactionSnapshot }>((r) =>
          r.delete(`/transactions/${id}`)
        ),
      unlinkTransfer: (id: string) =>
        call<{ data: Transaction; message: string }>((r) =>
          r.post(`/transactions/${id}/unlink-transfer`).send({})
        ),
      restore: (snapshot: TransactionSnapshot) =>
        call<{ data: Transaction; message: string }>((r) =>
          r.post('/transactions/restore').send(snapshot)
        ),
      suggestTags: (query: { description: string; entityId?: string }) =>
        call<{ tags: SuggestedTag[] }>((r) => r.get('/transactions/suggest-tags').query(query)),
      descriptionsForPreview: (query: { limit?: number } = {}) =>
        call<{
          data: { description: string; checksum: string | null }[];
          total: number;
          truncated: boolean;
        }>((r) => r.get('/transactions/descriptions-preview').query(query)),
      availableTags: () => call<{ tags: string[] }>((r) => r.get('/transactions/available-tags')),
    },
    tagRules: {
      list: (query: TagRuleListQuery = {}) =>
        call<{ data: TagRule[]; pagination: Pagination }>((r) => r.get('/tag-rules').query(query)),
      get: (id: string) => call<{ data: TagRule }>((r) => r.get(`/tag-rules/${id}`)),
      update: (id: string, data: Record<string, unknown>) =>
        call<{ data: TagRule; message: string }>((r) => r.patch(`/tag-rules/${id}`).send(data)),
      disable: (id: string) => call<{ message: string }>((r) => r.post(`/tag-rules/${id}/disable`)),
      delete: (id: string) => call<{ message: string }>((r) => r.delete(`/tag-rules/${id}`)),
      applyExisting: (id: string, body: { dryRun?: boolean } = {}) =>
        call<{ data: TagRuleApplyExistingResult }>((r) =>
          r.post(`/tag-rules/${id}/apply-existing`).send(body)
        ),
      matchPreview: (body: Record<string, unknown>) =>
        call<{ data: RuleMatchPreviewResult }>((r) =>
          r.post('/tag-rules/match-preview').send(body)
        ),
      vocabulary: () => call<{ tags: string[] }>((r) => r.get('/tag-rules/vocabulary')),
      facets: () =>
        call<{ facets: { facet: string; kind: string }[] }>((r) => r.get('/tag-rules/facets')),
      propose: (body: Record<string, unknown>) =>
        call<TagRuleProposal>((r) => r.post('/tag-rules/propose').send(body)),
      preview: (body: Record<string, unknown>) =>
        call<TagRulePreview>((r) => r.post('/tag-rules/preview').send(body)),
      apply: (body: Record<string, unknown>) =>
        call<{ rules: TagRule[] }>((r) => r.post('/tag-rules/apply').send(body)),
      reject: (body: Record<string, unknown>) =>
        call<{ message: string }>((r) => r.post('/tag-rules/reject').send(body)),
    },
    corrections: {
      list: (query: CorrectionListQuery = {}) =>
        call<{ data: Correction[]; pagination: Pagination }>((r) =>
          r.get('/corrections').query(query)
        ),
      get: (id: string) => call<{ data: Correction }>((r) => r.get(`/corrections/${id}`)),
      createOrUpdate: (body: Record<string, unknown>) =>
        call<{ data: Correction; message: string }>((r) => r.post('/corrections').send(body)),
      update: (id: string, data: Record<string, unknown>) =>
        call<{ data: Correction; message: string }>((r) =>
          r.patch(`/corrections/${id}`).send(data)
        ),
      delete: (id: string) => call<{ message: string }>((r) => r.delete(`/corrections/${id}`)),
      adjustConfidence: (id: string, delta: number) =>
        call<{ message: string }>((r) =>
          r.post(`/corrections/${id}/adjust-confidence`).send({ delta })
        ),
      applyExisting: (id: string, body: { dryRun?: boolean } = {}) =>
        call<{ data: CorrectionApplyExistingResult }>((r) =>
          r.post(`/corrections/${id}/apply-existing`).send(body)
        ),
      findMatch: (body: { description: string; minConfidence?: number }) =>
        call<{ data: Correction | null; status: 'matched' | 'uncertain' | null }>((r) =>
          r.post('/corrections/find-match').send(body)
        ),
      previewMatches: (body: Record<string, unknown>) =>
        call<{ data: PreviewMatchResult }>((r) =>
          r.post('/corrections/preview-matches').send(body)
        ),
      ruleMatchPreview: (body: Record<string, unknown>) =>
        call<{ data: RuleMatchPreviewResult }>((r) =>
          r.post('/corrections/rule-match-preview').send(body)
        ),
      listMerged: (body: Record<string, unknown> = {}) =>
        call<{ data: Correction[]; pagination: Pagination }>((r) =>
          r.post('/corrections/list-merged').send(body)
        ),
      previewChangeSet: (body: Record<string, unknown>) =>
        call<ChangeSetPreviewResult>((r) => r.post('/corrections/preview-changeset').send(body)),
      applyChangeSet: (body: Record<string, unknown>) =>
        call<{ data: Correction[]; message: string }>((r) =>
          r.post('/corrections/apply-changeset').send(body)
        ),
      analyzeCorrection: (body: Record<string, unknown>) =>
        call<{ data: { matchType: string; pattern: string; confidence: number } | null }>((r) =>
          r.post('/corrections/analyze').send(body)
        ),
      generateRules: (body: Record<string, unknown>) =>
        call<{
          proposals: {
            descriptionPattern: string;
            matchType: string;
            tags: string[];
            reasoning: string;
          }[];
        }>((r) => r.post('/corrections/generate-rules').send(body)),
      proposeChangeSet: (body: Record<string, unknown>) =>
        call<{
          changeSet: ChangeSet;
          rationale: string;
          preview: { counts: { affected: number }; affected: unknown[] };
          targetRules: Record<string, Correction>;
        }>((r) => r.post('/corrections/propose-changeset').send(body)),
      reviseChangeSet: (body: Record<string, unknown>) =>
        call<{
          changeSet: ChangeSet;
          rationale: string;
          targetRules: Record<string, Correction>;
        }>((r) => r.post('/corrections/revise-changeset').send(body)),
      rejectChangeSet: (body: Record<string, unknown>) =>
        call<{ message: string }>((r) => r.post('/corrections/reject-changeset').send(body)),
    },
    entityUsage: {
      list: (query: EntityUsageQuery = {}) =>
        call<{ data: EntityUsage[]; pagination: Pagination }>((r) =>
          r.get('/entity-usage').query(query)
        ),
    },
    imports: {
      processImport: (body: Record<string, unknown>) =>
        call<{ sessionId: string }>((r) => r.post('/imports/process').send(body)),
      getImportProgress: (sessionId: string) =>
        call<ImportProgress | null>((r) => r.get('/imports/progress').query({ sessionId })),
      createEntity: (body: { name: string }) =>
        call<CreateEntityOutput>((r) => r.post('/imports/entities').send(body)),
      applyChangeSetAndReevaluate: (body: Record<string, unknown>) =>
        call<{ result: ProcessImportOutput; affectedCount: number }>((r) =>
          r.post('/imports/apply-changeset-reevaluate').send(body)
        ),
      commitImport: (body: Record<string, unknown>) =>
        call<{ data: CommitResult; message: string }>((r) => r.post('/imports/commit').send(body)),
      reevaluateWithPendingRules: (body: Record<string, unknown>) =>
        call<{ result: ProcessImportOutput; affectedCount: number }>((r) =>
          r.post('/imports/reevaluate-pending').send(body)
        ),
    },
  };
}

/**
 * Poll an import session until it reports `completed`, returning the result.
 * The single pillar process completes small batches near-instantly, but the
 * processImport handler does its work on a detached promise so we still poll.
 */
export async function waitForImportCompletion<T>(
  client: ReturnType<typeof makeClient>,
  sessionId: string,
  maxAttempts = 50
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const progress = await client.imports.getImportProgress(sessionId);
    if (!progress) throw new Error('Progress not found');
    if (progress.status === 'completed') {
      if (!progress.result) throw new Error('Import completed but result is missing');
      return progress.result as T;
    }
    if (progress.status === 'failed') {
      throw new Error(`Import failed: ${progress.errors.map((e) => e.error).join(', ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timeout waiting for import to complete');
}
