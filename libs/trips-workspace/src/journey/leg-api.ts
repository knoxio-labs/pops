import { unwrap } from '@pops/pillar-sdk/client';

import {
  journeyLegsCreate,
  journeyLegsUpdate,
  journeyLegsReorder,
  journeyLegsRemove,
  journeyLegsRestore,
} from '../trips-api/sdk.gen';
import { legSource } from './model';

import type {
  JourneyChangeResult,
  JourneyCommand,
  JourneySource,
  JourneyWorkspaceProps,
  LegRemovalResult,
} from './types';

type LegCommand = Exclude<JourneyCommand, { kind: 'journey' }>;
/** Apply guarded source writes; removal lifecycle replays never borrow a later revision for an inverse. */
export async function applyLegCommand(
  props: JourneyWorkspaceProps,
  source: JourneySource,
  change: LegCommand
): Promise<JourneyChangeResult> {
  const common = {
    client: props.client,
    path: { tripId: props.tripId, journeyId: props.journeyId },
  };
  const expectedRevision = change.expectedRevision;
  if (change.kind === 'remove' || change.kind === 'restore')
    return applyLifecycle(common, source, change);
  switch (change.kind) {
    case 'create':
      return createLeg(common, source, change);
    case 'leg': {
      const previous = source.legs.find((leg) => leg.id === change.id);
      if (!previous) throw new Error('Missing source leg');
      const leg = unwrap(
        await journeyLegsUpdate({
          ...common,
          path: { ...common.path, id: change.id },
          body: { ...change.patch, expectedRevision },
        })
      );
      return {
        source: {
          ...source,
          legs: source.legs.map((entry) => (entry.id === leg.id ? leg : entry)),
          legRevision: expectedRevision + 1,
        },
        inverse: {
          kind: 'leg',
          id: leg.id,
          patch: legSource(previous),
          expectedRevision: expectedRevision + 1,
        },
      };
    }
    case 'order': {
      const result = unwrap(
        await journeyLegsReorder({ ...common, body: { legIds: change.ids, expectedRevision } })
      );
      return {
        source: { ...source, legs: result.legs, legRevision: expectedRevision + 1 },
        inverse: {
          kind: 'order',
          ids: source.legs.map((leg) => leg.id),
          expectedRevision: expectedRevision + 1,
        },
      };
    }
  }
}
async function createLeg(
  common: { client: JourneyWorkspaceProps['client']; path: { tripId: number; journeyId: number } },
  source: JourneySource,
  change: Extract<LegCommand, { kind: 'create' }>
): Promise<JourneyChangeResult> {
  const expectedRevision = change.expectedRevision;
  const leg = unwrap(
    await journeyLegsCreate({ ...common, body: { ...change.patch, expectedRevision } })
  );
  return {
    source: { ...source, legs: [...source.legs, leg], legRevision: expectedRevision + 1 },
    inverse: { kind: 'remove', id: leg.id, expectedRevision: expectedRevision + 1 },
  };
}

async function applyLifecycle(
  common: { client: JourneyWorkspaceProps['client']; path: { tripId: number; journeyId: number } },
  source: JourneySource,
  change: Extract<LegCommand, { kind: 'remove' | 'restore' }>
): Promise<JourneyChangeResult> {
  const expectedRevision = change.expectedRevision;
  switch (change.kind) {
    case 'remove': {
      const result = unwrap(
        await journeyLegsRemove({
          ...common,
          path: { ...common.path, id: change.id },
          body: { operationId: change.operationId, expectedRevision },
        })
      );
      return removalResult(source, result, change);
    }
    case 'restore': {
      const result = unwrap(
        await journeyLegsRestore({
          ...common,
          path: { ...common.path, operationId: change.operationId },
          body: { expectedRevision },
        })
      );
      return removalResult(source, result, change);
    }
  }
}

function removalResult(
  source: JourneySource,
  result: LegRemovalResult,
  change: Extract<LegCommand, { kind: 'remove' | 'restore' }>
): JourneyChangeResult {
  const receipt = result.receipt;
  const outcome = change.kind === 'remove' ? receipt.removedRevision : receipt.restoredRevision;
  const own =
    receipt.operationId === change.operationId &&
    (change.kind !== 'remove' || receipt.legId === change.id) &&
    outcome === change.expectedRevision + 1 &&
    result.revision === outcome &&
    receipt.state === (change.kind === 'remove' ? 'removed' : 'restored');
  return {
    source: { ...source, legs: result.legs, legRevision: result.revision },
    clearHistory: !own,
    ...(own && change.kind === 'remove'
      ? {
          inverse: {
            kind: 'restore' as const,
            operationId: receipt.operationId,
            expectedRevision: outcome,
          },
        }
      : {}),
  };
}
