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

import { egoChatBodySchema } from '../../contract/rest-ego-schemas.js';
import { EgoActionStore } from '../modules/ego/actions-store.js';
import {
  persistAssistantError,
  persistStreamResults,
  persistUserTurn,
  resolveConversation,
} from '../modules/ego/chat-helpers.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { buildEgoEngine } from './ego-engine.js';
import { setSseHeaders, streamError, writeSseEvent } from './ego-stream-frames.js';

import type { Conversation, Message } from '../modules/ego/persistence.js';
import type { AppContext, ChatStreamPreparation } from '../modules/ego/types.js';
import type { EgoHandlerDeps } from './ego-engine.js';

interface PipeStreamParams {
  req: Request;
  res: Response;
  persistence: ConversationPersistence;
  actions: EgoActionStore;
  preparation: ChatStreamPreparation;
  conversation: Conversation;
}

async function pipeStreamEvents(params: PipeStreamParams): Promise<void> {
  const { req, res, persistence, actions, preparation, conversation } = params;
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
  });

  for await (const event of preparation.stream) {
    if (clientDisconnected) break;

    if (event.type === 'token') {
      writeSseEvent(res, { type: 'token', text: event.text });
    } else if (event.type === 'tool') {
      writeSseEvent(res, { type: 'tool', name: event.name, status: event.status });
    } else if (event.type === 'part') {
      writeSseEvent(res, { type: 'part', part: event.part });
    } else if (event.type === 'navigate') {
      writeSseEvent(res, { type: 'navigate', uri: event.uri });
    } else if (event.type === 'done') {
      const assistantMsg = persistStreamResults({
        persistence,
        actions,
        conversationId: conversation.id,
        content: event.content,
        citations: event.citations,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        parts: event.parts,
        batch: event.batch,
        autoExecuted: event.autoExecuted,
        retrievedEngrams: preparation.retrievedEngrams,
        scopeNegotiation: preparation.scopeNegotiation,
      });

      writeSseEvent(res, {
        type: 'done',
        conversationId: conversation.id,
        messageId: assistantMsg.id,
        parts: event.parts,
        citations: event.citations,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        retrievedEngrams: preparation.retrievedEngrams,
        scopeNegotiation: preparation.scopeNegotiation,
      });
    }
  }
}

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
  input: ReturnType<typeof egoChatBodySchema.parse>;
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
  const parsed = egoChatBodySchema.safeParse(req.body);
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
