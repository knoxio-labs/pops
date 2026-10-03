/** REST integration coverage for recording Ego action-batch decisions. */
import { describe, expect, it } from 'vitest';

import { egoActionsService } from '../../db/index.js';
import { ConversationPersistence } from '../modules/ego/persistence.js';
import { actionsPart, createEgoActionsTestSetup } from './ego-actions-test-utils.js';

const setup = createEgoActionsTestSetup();

describe('Ego action-batch decisions', () => {
  it('confirms every approved action and updates the existing assistant message', async () => {
    const pending = await setup.createPendingBatch();
    const result = await pending.client.ego.decideActionBatch(pending.batchId, {
      approve: pending.actionIds,
      reject: [],
      alwaysAllow: [],
    });

    expect(result.batch.status).toBe('decided');
    expect(result.batch.actions.map((action) => action.status)).toEqual([
      'confirmed',
      'confirmed',
      'confirmed',
    ]);
    expect(
      actionsPart(result.updatedMessage?.parts).actions.map((action) => action.status)
    ).toEqual(['confirmed', 'confirmed', 'confirmed']);
    expect(pending.callTool).not.toHaveBeenCalled();

    const conversation = await pending.client.ego.getConversation(pending.conversationId);
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[1]?.id).toBe(pending.messageId);
    expect(
      actionsPart(conversation.messages[1]?.parts).actions.map((action) => action.status)
    ).toEqual(['confirmed', 'confirmed', 'confirmed']);
  });

  it('preserves proposal order when approving one action and rejecting two', async () => {
    const pending = await setup.createPendingBatch();
    const firstActionId = pending.actionIds[0];
    if (firstActionId === undefined) throw new Error('Pending batch has no actions.');
    const result = await pending.client.ego.decideActionBatch(pending.batchId, {
      approve: [firstActionId],
      reject: pending.actionIds.slice(1),
      alwaysAllow: [],
    });

    expect(result.batch.actions.map((action) => action.status)).toEqual([
      'confirmed',
      'rejected',
      'rejected',
    ]);
    expect(pending.callTool).not.toHaveBeenCalled();
  });

  it('remembers always-allow choices only on the batch conversation', async () => {
    const persistence = new ConversationPersistence({ db: setup.db() });
    const otherConversation = persistence.createConversation({ model: 'scripted-model' });
    const pending = await setup.createPendingBatch();
    const firstActionId = pending.actionIds[0];
    const allowedTool = pending.tools[0];
    if (firstActionId === undefined || allowedTool === undefined) {
      throw new Error('Pending batch has no first action or tool.');
    }

    await pending.client.ego.decideActionBatch(pending.batchId, {
      approve: [firstActionId],
      reject: pending.actionIds.slice(1),
      alwaysAllow: [allowedTool],
    });

    expect(persistence.getAllowedTools(pending.conversationId)).toEqual([allowedTool]);
    expect(persistence.getAllowedTools(otherConversation.id)).toEqual([]);
  });

  it('rejects a repeated decision without changing decided action rows', async () => {
    const pending = await setup.createPendingBatch();
    const decision = { approve: pending.actionIds, reject: [], alwaysAllow: [] };
    await pending.client.ego.decideActionBatch(pending.batchId, decision);
    const rows = egoActionsService.listActionsForBatch(setup.db(), pending.batchId);

    await expect(
      pending.client.ego.decideActionBatch(pending.batchId, decision)
    ).rejects.toMatchObject({ status: 409 });

    expect(egoActionsService.listActionsForBatch(setup.db(), pending.batchId)).toEqual(rows);
  });
});
