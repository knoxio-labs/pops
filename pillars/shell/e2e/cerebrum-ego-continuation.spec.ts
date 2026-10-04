/** Browser coverage for recovering an Ego decision and safely continuing it. */
import { z } from 'zod';

import { expect, test } from './fixtures/pillar-rest-guard';
import { assertMatchesContract, stubShellBoot } from './helpers/pillar-rest';

const conversationId = 'conversation-ego-recovery';
const batchId = 'batch-ego-recovery';
const actionId = 'action-ego-recovery';
const conversationTitle = 'Fake interrupted conversation';
const timestamp = '2026-09-30T12:00:00.000Z';

/**
 * Hand-mirrors Cerebrum's `rest-ego-schemas.ts` and `rest-ego-parts.ts` wire
 * contract; e2e specs cannot import another pillar's internal schemas.
 */
const ConversationSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
    activeScopes: z.array(z.string()),
    appContext: z.unknown().nullable(),
    model: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

const MessagePartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }).strict(),
  z
    .object({
      type: z.literal('entity'),
      uri: z.string().regex(/^pops:([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\/([^/\s]+)$/),
      title: z.string().min(1),
      subtitle: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('actions'),
      batchId: z.string().min(1),
      actions: z
        .array(
          z
            .object({
              actionId: z.string().min(1),
              tool: z.string().min(1),
              summary: z.string(),
              status: z.enum(['pending', 'confirmed', 'rejected', 'executed', 'failed']),
            })
            .strict()
        )
        .min(1),
    })
    .strict(),
]);

const ConversationMessageSchema = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    role: z.string(),
    content: z.string(),
    citations: z.unknown().nullable(),
    toolCalls: z.unknown().nullable(),
    parts: z.array(MessagePartSchema).nullable(),
    tokensIn: z.number().nullable(),
    tokensOut: z.number().nullable(),
    createdAt: z.string(),
  })
  .strict();

const ActionSchema = z
  .object({
    id: z.string(),
    batchId: z.string(),
    conversationId: z.string(),
    messageId: z.string(),
    tool: z.string(),
    summary: z.string(),
    status: z.enum(['pending', 'confirmed', 'rejected', 'executed', 'failed']),
    result: z.string().nullable(),
    createdAt: z.string(),
    resolvedAt: z.string().nullable(),
  })
  .strict();

const BatchSchema = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    messageId: z.string(),
    status: z.enum(['pending', 'decided', 'continued', 'auto']),
    actions: z.array(ActionSchema),
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
  })
  .strict();

const ConversationListSchema = z
  .object({ conversations: z.array(ConversationSchema), total: z.number().int() })
  .strict();
const ConversationDetailSchema = z
  .object({
    conversation: ConversationSchema,
    messages: z.array(ConversationMessageSchema),
  })
  .strict();
const DecisionResponseSchema = z
  .object({ batch: BatchSchema, updatedMessage: ConversationMessageSchema.nullable() })
  .strict();
const DecisionRequestSchema = z
  .object({
    approve: z.array(z.string().min(1)),
    reject: z.array(z.string().min(1)),
    alwaysAllow: z.array(z.string().min(1)),
  })
  .strict();

/** Hand-mirrors `egoResumeBodySchema` in Cerebrum's `rest-ego-stream.ts`. */
const ResumeRequestSchema = z
  .object({
    conversationId: z.string().min(1),
    resumeBatchId: z.string().min(1),
    channel: z.enum(['shell', 'moltbot', 'mcp', 'cli']).optional(),
  })
  .strict();

/** Hand-mirrors the error member of `egoStreamFrameSchema` in `rest-ego-stream.ts`. */
const StreamErrorFrameSchema = z
  .object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    retryable: z.boolean(),
    conversationId: z.string().optional(),
  })
  .strict();

function jsonBody(body: unknown): string {
  return JSON.stringify(body);
}

function fakeConversation() {
  return {
    id: conversationId,
    title: conversationTitle,
    activeScopes: [],
    appContext: null,
    model: 'fake-model',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function fakeAction(status: 'pending' | 'confirmed') {
  return {
    actionId,
    tool: 'finance.transactions.create',
    summary: 'Create a fake transaction',
    status,
  };
}

function fakeMessage(status: 'pending' | 'confirmed') {
  return {
    id: 'assistant-message-ego-recovery',
    conversationId,
    role: 'assistant',
    content: '',
    citations: null,
    toolCalls: null,
    tokensIn: null,
    tokensOut: null,
    createdAt: timestamp,
    parts: [{ type: 'actions', batchId, actions: [fakeAction(status)] }],
  };
}

function fakeDecisionResponse() {
  const action = fakeAction('confirmed');
  return {
    batch: {
      actions: [
        {
          batchId,
          conversationId,
          createdAt: timestamp,
          id: actionId,
          messageId: 'assistant-message-ego-recovery',
          resolvedAt: timestamp,
          result: null,
          status: action.status,
          summary: action.summary,
          tool: action.tool,
        },
      ],
      conversationId,
      createdAt: timestamp,
      decidedAt: timestamp,
      id: batchId,
      messageId: 'assistant-message-ego-recovery',
      status: 'decided',
    },
    updatedMessage: null,
  };
}

test('recovers a recorded decision after reload and resumes once for rapid Continue clicks', async ({
  page,
}) => {
  await stubShellBoot(page, ['cerebrum']);

  let decisionRequests = 0;
  let actionStatus: 'pending' | 'confirmed' = 'pending';
  const resumeBodies: unknown[] = [];
  const resumeStarted = deferred();
  const allowResumeToFinish = deferred();

  await page.route(/\/cerebrum-api\/ego\/conversations\/search$/, async (route) => {
    const body = { conversations: [fakeConversation()], total: 1 };
    assertMatchesContract(ConversationListSchema, body, 'ego.listConversations');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: jsonBody(body),
    });
  });

  await page.route(
    new RegExp(`/cerebrum-api/ego/conversations/${conversationId}$`),
    async (route) => {
      const body = {
        conversation: fakeConversation(),
        messages: [fakeMessage(actionStatus)],
      };
      assertMatchesContract(ConversationDetailSchema, body, 'ego.getConversation');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: jsonBody(body),
      });
    }
  );

  await page.route(
    new RegExp(`/cerebrum-api/ego/action-batches/${batchId}/decide$`),
    async (route) => {
      decisionRequests += 1;
      const requestBody = route.request().postDataJSON();
      assertMatchesContract(DecisionRequestSchema, requestBody, 'ego.decideActionBatch request');
      expect(requestBody).toEqual({
        approve: [actionId],
        reject: [],
        alwaysAllow: [],
      });
      actionStatus = 'confirmed';
      const body = fakeDecisionResponse();
      assertMatchesContract(DecisionResponseSchema, body, 'ego.decideActionBatch');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: jsonBody(body),
      });
    }
  );

  await page.route(/\/cerebrum-api\/ego\/chat\/stream$/, async (route) => {
    const requestBody = route.request().postDataJSON();
    assertMatchesContract(ResumeRequestSchema, requestBody, 'ego.chatStream resume request');
    resumeBodies.push(requestBody);

    if (resumeBodies.length === 1) {
      // The decision was durably acknowledged, but the first continuation
      // never reaches Cerebrum. Reloading must recover the still-decided batch.
      await route.abort('failed');
      return;
    }

    if (resumeBodies.length === 2) {
      resumeStarted.resolve();
      await allowResumeToFinish.promise;
      const frame = {
        type: 'error',
        code: 'test.fake-stream-ended',
        message: 'Fake continuation stopped after the request-count assertion.',
        retryable: true,
        conversationId,
      };
      assertMatchesContract(StreamErrorFrameSchema, frame, 'ego.chatStream.error');
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `data: ${jsonBody(frame)}\n\n`,
      });
      return;
    }

    await route.abort('failed');
  });

  try {
    await page.goto('/cerebrum/chat');
    const conversation = page
      .getByRole('listitem')
      .filter({ hasText: conversationTitle })
      .getByRole('button')
      .first();
    await conversation.click();

    const actionCard = page.getByRole('region', { name: `Actions for batch ${batchId}` });
    await expect(actionCard.getByRole('button', { name: 'Approve (1)' })).toBeVisible();
    await actionCard.getByRole('button', { name: 'Approve (1)' }).click();

    await expect.poll(() => decisionRequests).toBe(1);
    await expect.poll(() => resumeBodies.length).toBe(1);
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
    expect(resumeBodies[0]).toEqual({ conversationId, resumeBatchId: batchId });

    await page.reload();
    await page
      .getByRole('listitem')
      .filter({ hasText: conversationTitle })
      .getByRole('button')
      .first()
      .click();
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(continueButton).toBeVisible();
    await expect(actionCard.getByText('Confirmed, running')).toBeVisible();

    // Keep the fake resumed stream pending while the browser emits two clicks.
    // Streaming removes the Continue control immediately; the second click
    // must not create another resume request.
    await continueButton.dblclick();
    await resumeStarted.promise;
    await expect.poll(() => resumeBodies.length).toBe(2);
    expect(resumeBodies[1]).toEqual({ conversationId, resumeBatchId: batchId });
    await expect(continueButton).toHaveCount(0);

    allowResumeToFinish.resolve();
    await expect(page.getByRole('alert')).toContainText('Fake continuation stopped');

    expect(decisionRequests).toBe(1);
    expect(resumeBodies).toHaveLength(2);
  } finally {
    allowResumeToFinish.resolve();
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
