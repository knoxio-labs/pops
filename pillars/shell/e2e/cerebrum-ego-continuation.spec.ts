/** Browser coverage for recovering an Ego decision and safely continuing it. */
import { expect, test } from './fixtures/pillar-rest-guard';
import { stubShellBoot } from './helpers/pillar-rest';

const conversationId = 'conversation-ego-recovery';
const batchId = 'batch-ego-recovery';
const actionId = 'action-ego-recovery';
const conversationTitle = 'Fake interrupted conversation';
const timestamp = '2026-09-30T12:00:00.000Z';

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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: jsonBody({ conversations: [fakeConversation()], total: 1 }),
    });
  });

  await page.route(
    new RegExp(`/cerebrum-api/ego/conversations/${conversationId}$`),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: jsonBody({
          conversation: fakeConversation(),
          messages: [fakeMessage(actionStatus)],
        }),
      });
    }
  );

  await page.route(
    new RegExp(`/cerebrum-api/ego/action-batches/${batchId}/decide$`),
    async (route) => {
      decisionRequests += 1;
      expect(route.request().postDataJSON()).toEqual({
        approve: [actionId],
        reject: [],
        alwaysAllow: [],
      });
      actionStatus = 'confirmed';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: jsonBody(fakeDecisionResponse()),
      });
    }
  );

  await page.route(/\/cerebrum-api\/ego\/chat\/stream$/, async (route) => {
    resumeBodies.push(route.request().postDataJSON());

    if (resumeBodies.length === 1) {
      // The decision was durably acknowledged, but the first continuation
      // never reaches Cerebrum. Reloading must recover the still-decided batch.
      await route.abort('failed');
      return;
    }

    if (resumeBodies.length === 2) {
      resumeStarted.resolve();
      await allowResumeToFinish.promise;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `data: ${jsonBody({
          type: 'error',
          code: 'test.fake-stream-ended',
          message: 'Fake continuation stopped after the request-count assertion.',
          retryable: true,
          conversationId,
        })}\n\n`,
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
