import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openCerebrumDb } from '../../../../db/index.js';
import { EgoActionStore } from '../actions-store.js';
import { DECLINED_RESULT } from '../loop-resume.js';
import { ConversationPersistence } from '../persistence.js';

import type { EgoActionsPart, EgoMessagePart } from '../../../../contract/rest-ego-parts.js';
import type { EgoActionStatus, EgoBatchStatus } from '../../../../db/index.js';
import type { Message } from '../persistence.js';

/** Stable action rows used by batch-settlement tests. */
export const SETTLE_ACTIONS = [
  { tool: 'finance.transactions.addTags', summary: 'Tag transaction' },
  { tool: 'inventory.items.move', summary: 'Move item' },
  { tool: 'finance.transactions.removeTags', summary: 'Remove tag' },
] as const;

/** Database and persistence objects for one disposable settlement test. */
export interface SettleFixture {
  store: EgoActionStore;
  persistence: ConversationPersistence;
  conversationId: string;
  readMessage: (messageId: string) => Message | undefined;
  close: () => void;
}

/** Parameters for seeding a batch and its matching message and action rows. */
export interface SeedBatchOptions {
  id: string;
  status: EgoBatchStatus;
  actionStatuses?: readonly EgoActionStatus[];
  actionCount?: number;
  withActionsPart?: boolean;
}

/** Identity data returned for one seeded batch. */
export interface SeededBatch {
  id: string;
  messageId: string;
  actionIds: string[];
}

/** Create a temp Cerebrum database with a real store and conversation persistence. */
export function createSettleFixture(): SettleFixture {
  const dir = mkdtempSync(join(tmpdir(), 'cerebrum-batch-settle-'));
  const opened = openCerebrumDb(join(dir, 'cerebrum.db'), { loadVec: false });
  let tick = 0;
  const now = (): Date => new Date(Date.UTC(2026, 5, 1, 10) + tick++);
  const persistence = new ConversationPersistence({ db: opened.db, now });
  const store = new EgoActionStore({ db: opened.db, now: () => now() });
  const conversationId = persistence.createConversation({ model: 'test-model' }).id;
  return {
    store,
    persistence,
    conversationId,
    readMessage: (messageId) =>
      persistence.getConversation(conversationId)?.messages.find(({ id }) => id === messageId),
    close: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Seed a batch and its assistant action card in a settlement fixture. */
export function seedBatch(fixture: SettleFixture, options: SeedBatchOptions): SeededBatch {
  const actions = SETTLE_ACTIONS.slice(0, options.actionCount ?? SETTLE_ACTIONS.length);
  const rows = actions.map((action, index) => ({
    ...action,
    id: options.id + '-action-' + (index + 1),
    status: options.actionStatuses?.[index] ?? ('pending' as const),
  }));
  const actionIds = rows.map(({ id }) => id);
  const parts: EgoMessagePart[] = [{ type: 'text', text: 'These actions are waiting.' }];
  if (options.withActionsPart !== false) {
    const card: EgoActionsPart = {
      type: 'actions',
      batchId: options.id,
      actions: rows.map(({ id, tool, summary, status }) => ({
        actionId: id,
        tool,
        summary,
        status,
      })),
    };
    parts.push(card);
  }
  const message = fixture.persistence.appendMessage(fixture.conversationId, {
    role: 'assistant',
    content: 'These actions are waiting.',
    parts,
  });
  fixture.store.createBatch({
    id: options.id,
    conversationId: fixture.conversationId,
    messageId: message.id,
    status: options.status,
  });
  rows.forEach(({ id, tool, summary, status }, position) => {
    let result: string | undefined;
    if (options.status === 'auto' || status === 'executed') result = 'Existing result.';
    else if (status === 'failed') result = 'Previous failure.';
    else if (status === 'rejected') result = DECLINED_RESULT;
    fixture.store.create({
      id,
      batchId: options.id,
      conversationId: fixture.conversationId,
      messageId: message.id,
      toolUseId: 'tool-use-' + id,
      position,
      tool,
      args: { position },
      summary,
      status,
      ...(result === undefined ? {} : { result }),
    });
  });
  return { id: options.id, messageId: message.id, actionIds };
}

/** Return the first action id, throwing when a seeded batch contains no actions. */
export function firstActionId(batch: SeededBatch): string {
  const actionId = batch.actionIds[0];
  if (actionId === undefined) throw new Error('The seeded batch has no actions.');
  return actionId;
}

/** Return a batch's actions part from its stored assistant message. */
export function actionsPart(
  fixture: SettleFixture,
  batch: SeededBatch
): EgoActionsPart | undefined {
  return fixture
    .readMessage(batch.messageId)
    ?.parts?.find(
      (part): part is EgoActionsPart => part.type === 'actions' && part.batchId === batch.id
    );
}
