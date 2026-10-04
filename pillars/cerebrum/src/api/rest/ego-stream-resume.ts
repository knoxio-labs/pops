import { executeConfirmedActions, unavailableGateway } from '../modules/ego/action-runner.js';
import { EgoActionStore } from '../modules/ego/actions-store.js';
import { syncActionsPart } from '../modules/ego/batch-decision.js';
import { settleConversation } from '../modules/ego/batch-settle.js';
import { persistAssistantError } from '../modules/ego/chat-helpers.js';
import { INTERRUPTED_RESULT, type ActionResolution } from '../modules/ego/loop-resume.js';
import { parsePausedLoopState } from '../modules/ego/loop-state.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { cerebrumErrors } from '../shared/errors.js';
import { buildEgoEngine } from './ego-engine.js';
import { streamError, writeSseEvent } from './ego-stream-frames.js';
import { pipeStreamEvents } from './ego-stream-pipe.js';

import type { Request, Response } from 'express';

import type { EgoActionsPart } from '../../contract/rest-ego-parts.js';
import type { EgoResumeBody } from '../../contract/rest-ego-stream.js';
import type { ActionRunEvent } from '../modules/ego/action-runner.js';
import type { Conversation } from '../modules/ego/persistence.js';
import type { ChatStreamEvent, ChatStreamPreparation } from '../modules/ego/types.js';
import type { EgoHandlerDeps } from './ego-engine.js';

const activeResumeBatches = new Set<string>();

interface ResumeContext {
  persistence: ConversationPersistence;
  store: EgoActionStore;
  conversation: Conversation;
  batch: NonNullable<ReturnType<EgoActionStore['getBatch']>>;
  confirmed: ReturnType<EgoActionStore['listForBatch']>;
  state: NonNullable<ReturnType<typeof parsePausedLoopState>>;
}

/** Prepare a decided action batch and the paused Ego turn for the existing SSE route. */
export async function prepareResume(
  deps: EgoHandlerDeps,
  input: EgoResumeBody
): Promise<{ conversation: Conversation; preparation: ChatStreamPreparation }> {
  const context = loadResumeContext(deps, input);
  activeResumeBatches.add(context.batch.id);
  try {
    const interruptedPart = await claimAndRecoverBatch(context);
    await settleConversation(
      { store: context.store, persistence: context.persistence },
      context.conversation.id,
      {
        reason: 'resume',
        exceptBatchId: context.batch.id,
      }
    );

    const runActions = makeResumeActionRunner(
      {
        store: context.store,
        persistence: context.persistence,
        gateway: deps.tools?.gateway ?? unavailableGateway,
        batchId: context.batch.id,
      },
      interruptedPart
    );
    const stream = buildEgoEngine(deps).resumeStream({
      state: context.state,
      runActions,
      allowedTools: context.persistence.getAllowedTools(context.conversation.id),
    });
    const preparation: ChatStreamPreparation = {
      stream: releaseResumeBatch(context.batch.id, stream),
      retrievedEngrams: [],
      scopeNegotiation: {
        scopes: context.conversation.activeScopes,
        changed: false,
        reason: null,
        secretNotice: null,
      },
    };
    return { conversation: context.conversation, preparation };
  } catch (error) {
    activeResumeBatches.delete(context.batch.id);
    throw error;
  }
}

function loadResumeContext(deps: EgoHandlerDeps, input: EgoResumeBody): ResumeContext {
  const persistence = new ConversationPersistence({ db: deps.db });
  const store = new EgoActionStore({ db: deps.db });
  const saved = persistence.getConversation(input.conversationId);
  if (saved === null) throw cerebrumErrors.batch_not_resumable();

  const batch = store.getBatch(input.resumeBatchId);
  if (batch === null || batch.conversationId !== saved.conversation.id) {
    throw cerebrumErrors.batch_not_resumable();
  }

  const actions = store.listForBatch(batch.id);
  const confirmed = actions.filter((action) => action.status === 'confirmed');
  if (batch.status !== 'decided' && !(batch.status === 'continued' && confirmed.length > 0)) {
    throw cerebrumErrors.batch_not_resumable();
  }

  const state = parsePausedLoopState(batch.loopState);
  if (state === null) throw cerebrumErrors.batch_state_invalid();
  if (activeResumeBatches.has(batch.id)) throw cerebrumErrors.batch_not_resumable();

  return {
    persistence,
    store,
    conversation: saved.conversation,
    batch,
    confirmed,
    state,
  };
}

async function claimAndRecoverBatch(context: ResumeContext): Promise<EgoActionsPart | null> {
  if (context.batch.status === 'decided') {
    if (!context.store.transitionBatch(context.batch.id, 'decided', 'continued')) {
      throw cerebrumErrors.batch_not_resumable();
    }
    return null;
  }

  let failed = 0;
  for (const action of context.confirmed) {
    if (context.store.transition(action.id, 'confirmed', 'failed', INTERRUPTED_RESULT)) failed += 1;
  }
  if (failed === 0) throw cerebrumErrors.batch_not_resumable();
  return (await syncActionsPart(context, context.batch))?.part ?? null;
}

interface ResumeRouteParams {
  deps: EgoHandlerDeps;
  req: Request;
  res: Response;
  persistence: ConversationPersistence;
  actions: EgoActionStore;
  input: EgoResumeBody;
}

export async function handleResumeStreamRequest(params: ResumeRouteParams): Promise<void> {
  const { deps, req, res, persistence, actions, input } = params;
  let resumed: Awaited<ReturnType<typeof prepareResume>>;
  try {
    resumed = await prepareResume(deps, input);
  } catch (error) {
    writeSseEvent(res, {
      ...streamError(error, req.requestId),
      conversationId: input.conversationId,
    });
    res.end();
    return;
  }

  try {
    await pipeStreamEvents({
      req,
      res,
      persistence,
      actions,
      preparation: resumed.preparation,
      conversation: resumed.conversation,
    });
  } catch (error) {
    const failure = streamError(error, req.requestId);
    persistAssistantError(persistence, resumed.conversation.id, String(failure['message']));
    writeSseEvent(res, {
      ...failure,
      conversationId: resumed.conversation.id,
      retryable: false,
    });
  }
  res.end();
}

function makeResumeActionRunner(
  params: Parameters<typeof executeConfirmedActions>[0],
  interruptedPart: EgoActionsPart | null
): AsyncGenerator<ActionRunEvent, ReadonlyMap<string, ActionResolution>> {
  return (async function* () {
    if (interruptedPart !== null) yield { type: 'part', part: interruptedPart };
    return yield* executeConfirmedActions(params);
  })();
}

async function* releaseResumeBatch(
  batchId: string,
  stream: AsyncGenerator<ChatStreamEvent>
): AsyncGenerator<ChatStreamEvent> {
  try {
    yield* stream;
  } finally {
    activeResumeBatches.delete(batchId);
  }
}
