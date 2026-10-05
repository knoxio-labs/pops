/** REST integration coverage for rejected Ego batch decisions and route scope. */
import { describe, expect, it } from 'vitest';

import { egoActionBatchesService, egoActionsService } from '../../db/index.js';
import { cerebrumScopeMap } from '../middleware/service-account-scope.js';
import { createEgoActionsTestSetup } from './ego-actions-test-utils.js';

const setup = createEgoActionsTestSetup();

describe('Ego action-batch decision errors', () => {
  it('leaves a batch pending when a decision omits actions or allows an unapproved tool', async () => {
    for (const invalid of ['incomplete', 'unapproved-always-allow'] as const) {
      const pending = await setup.createPendingBatch();
      const firstActionId = pending.actionIds[0];
      const unapprovedTool = pending.tools[1];
      if (firstActionId === undefined || unapprovedTool === undefined) {
        throw new Error('Pending batch has too few actions.');
      }
      const decision =
        invalid === 'incomplete'
          ? { approve: [firstActionId], reject: [], alwaysAllow: [] }
          : {
              approve: [firstActionId],
              reject: pending.actionIds.slice(1),
              alwaysAllow: [unapprovedTool],
            };

      await expect(
        pending.client.ego.decideActionBatch(pending.batchId, decision)
      ).rejects.toMatchObject({
        status: 400,
        body: { code: 'cerebrum.ego.invalid_decision' },
      });
      expect(egoActionBatchesService.getBatch(setup.db(), pending.batchId)?.status).toBe('pending');
      expect(
        egoActionsService
          .listActionsForBatch(setup.db(), pending.batchId)
          .map((action) => action.status)
      ).toEqual(['pending', 'pending', 'pending']);
    }
  });

  it('returns 404 for an unknown batch', async () => {
    const client = setup.createClient();
    await expect(
      client.ego.decideActionBatch('bat_missing', { approve: [], reject: [], alwaysAllow: [] })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('requires the configured gateway for approvals but still records all-reject decisions', async () => {
    const pending = await setup.createPendingBatch();
    const clientWithoutTools = setup.createClient();

    await expect(
      clientWithoutTools.ego.decideActionBatch(pending.batchId, {
        approve: pending.actionIds,
        reject: [],
        alwaysAllow: [],
      })
    ).rejects.toMatchObject({
      status: 503,
      body: { code: 'cerebrum.ego.gateway_unavailable' },
    });
    expect(egoActionBatchesService.getBatch(setup.db(), pending.batchId)?.status).toBe('pending');

    const result = await clientWithoutTools.ego.decideActionBatch(pending.batchId, {
      approve: [],
      reject: pending.actionIds,
      alwaysAllow: [],
    });
    expect(result.batch.actions.map((action) => action.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(pending.callTool).not.toHaveBeenCalled();
  });

  it('gates the route on its dedicated service-account scope', async () => {
    const app = setup.createApp({
      serviceAccountVerifier: async () => ({
        outcome: 'authenticated',
        principal: { id: 'sa_test', name: 'test', scopes: ['cerebrum.templates'] },
      }),
    });
    const response = await setup
      .requestOn(app)
      .post('/ego/action-batches/bat_test/decide')
      .set('x-api-key', 'test-service-account-key')
      .send({ approve: [], reject: [], alwaysAllow: [] });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'cerebrum.auth.forbidden' });
    expect(cerebrumScopeMap.routes).toContainEqual(
      expect.objectContaining({
        scope: 'cerebrum.ego.decideActionBatch',
        method: 'POST',
        path: '/ego/action-batches/:batchId/decide',
      })
    );
  });

  it('publishes only the single batch-decision operation', async () => {
    const response = await setup.requestOn(setup.createApp()).get('/openapi');
    const body = response.body as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    const operations = Object.values(body.paths).flatMap((path) => Object.values(path));

    expect(response.status).toBe(200);
    expect(body.paths['/ego/action-batches/{batchId}/decide']?.post?.operationId).toBe(
      'ego.decideActionBatch'
    );
    expect(operations.map((operation) => operation.operationId)).not.toContain('ego.confirmAction');
    expect(operations.map((operation) => operation.operationId)).not.toContain('ego.rejectAction');
  });
});
