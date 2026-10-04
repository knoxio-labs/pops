/**
 * SSE route for streaming ego chat responses (pillars/cerebrum/docs/prds/ego-core).
 *
 * `POST /ego/chat/stream` — accepts the same body as `ego.chat` but returns a
 * `text/event-stream`:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"tool"|"part"|"navigate",...}
 *   data: {"type":"done"|"error",...}
 *
 * Every frame is defined by `src/contract/rest-ego-stream.ts`.
 *
 * ts-rest cannot model SSE, so this is mounted as a plain Express route in
 * `app.ts` BEFORE `createExpressEndpoints`. The user turn is persisted before
 * streaming; the assistant turn + engram context links are persisted after the
 * `done` event (parity with `ego.chat`). A pre-stream failure emits an `error`
 * frame; a mid-stream failure persists a placeholder assistant message and
 * emits an `error` frame.
 */
import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';

import { PopsError } from '@pops/pillar-express';

import { egoStreamBodySchema } from '../../contract/rest-ego-stream.js';
import { EgoActionStore } from '../modules/ego/actions-store.js';
import {
  persistAssistantError,
  persistUserTurn,
  resolveConversation,
} from '../modules/ego/chat-helpers.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { buildEgoEngine } from './ego-engine.js';
import { settleForMessage } from './ego-settle.js';
import { setSseHeaders, streamError, writeSseEvent } from './ego-stream-frames.js';
import { pipeStreamEvents } from './ego-stream-pipe.js';
import { handleResumeStreamRequest } from './ego-stream-resume.js';

import type { EgoChatBodyWire } from '../../contract/rest-ego-schemas.js';
import type { Conversation, Message } from '../modules/ego/persistence.js';
import type { AppContext } from '../modules/ego/types.js';
import type { EgoHandlerDeps } from './ego-engine.js';

interface ResolvedTurn {
  conversation: Conversation;
  history: Message[];
}

/**
 * Resolve the conversation, snapshot the prior history, and persist the user
 * turn. The history snapshot is taken BEFORE the user turn is appended so the
 * engine sees the prior turns plus the new `message` arg. Emits an SSE `error`
 * frame + ends the response on failure (returns null).
 */
interface ResolveTurnParams {
  deps: EgoHandlerDeps;
  persistence: ConversationPersistence;
  res: Response;
  input: EgoChatBodyWire;
  requestId: string | undefined;
}

function resolveAndPersistUserTurn(params: ResolveTurnParams): ResolvedTurn | null {
  const { deps, persistence, res, input, requestId } = params;
  const appContext: AppContext | undefined = input.appContext ?? undefined;
  try {
    const conversation = resolveConversation({
      persistence,
      conversationId: input.conversationId,
      message: input.message,
      scopes: input.scopes ?? [],
      appContext,
      model: deps.llm.model(),
    });
    const history = persistence.getConversation(conversation.id)?.messages ?? [];
    persistUserTurn({
      persistence,
      conversationId: conversation.id,
      userMessage: input.message,
      storedAppContext: conversation.appContext as AppContext | undefined | null,
      incomingAppContext: appContext,
    });
    return { conversation, history };
  } catch (err) {
    writeSseEvent(res, streamError(err, requestId));
    res.end();
    return null;
  }
}

async function handleStreamRequest(
  deps: EgoHandlerDeps,
  req: Request,
  res: Response,
  next: (error: unknown) => void
): Promise<void> {
  const parsed = egoStreamBodySchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new PopsError({
        code: 'cerebrum.request.invalid',
        status: 400,
        message: 'The request is invalid.',
        retryable: false,
        details: { issues: parsed.error.issues },
      })
    );
    return;
  }
  const input = parsed.data;

  setSseHeaders(res);

  const persistence = new ConversationPersistence({ db: deps.db });
  const actions = new EgoActionStore({ db: deps.db });
  if ('resumeBatchId' in input) {
    await handleResumeStreamRequest({ deps, req, res, persistence, actions, input });
    return;
  }

  await handleNewMessageStreamRequest({
    deps,
    req,
    res,
    persistence,
    actions,
    input,
  });
}

interface NewMessageStreamParams {
  deps: EgoHandlerDeps;
  req: Request;
  res: Response;
  persistence: ConversationPersistence;
  actions: EgoActionStore;
  input: EgoChatBodyWire;
}

async function handleNewMessageStreamRequest(params: NewMessageStreamParams): Promise<void> {
  const { deps, req, res, persistence, actions, input } = params;
  const settled = input.conversationId
    ? await settleForMessage(deps, input.conversationId).catch((error: unknown) => {
        writeSseEvent(res, streamError(error, req.requestId));
        res.end();
        return null;
      })
    : undefined;
  if (settled === null) return;
  for (const part of settled?.parts ?? []) writeSseEvent(res, { type: 'part', part });

  const resolved = resolveAndPersistUserTurn({
    deps,
    persistence,
    res,
    input,
    requestId: req.requestId,
  });
  if (!resolved) return;
  const { conversation, history } = resolved;
  const appContext: AppContext | undefined = input.appContext ?? undefined;

  try {
    const preparation = await buildEgoEngine(deps).prepareStream({
      conversationId: conversation.id,
      message: input.message,
      history,
      activeScopes: conversation.activeScopes,
      appContext: appContext ?? (conversation.appContext as AppContext | undefined),
      channel: input.channel ?? 'shell',
      knownScopes: input.knownScopes,
      allowedTools: persistence.getAllowedTools(conversation.id),
      settled: settled?.actions,
    });
    await pipeStreamEvents({ req, res, persistence, actions, preparation, conversation });
  } catch (err) {
    const failure = streamError(err, req.requestId);
    persistAssistantError(persistence, conversation.id, String(failure['message']));
    writeSseEvent(res, { ...failure, conversationId: conversation.id });
  }

  res.end();
}

/** Build the SSE router. Mount in `app.ts` before `createExpressEndpoints`. */
export function makeEgoStreamRouter(deps: EgoHandlerDeps): ExpressRouter {
  const router: ExpressRouter = Router();
  router.post('/ego/chat/stream', (req: Request, res: Response, next) => {
    void handleStreamRequest(deps, req, res, next);
  });
  return router;
}
