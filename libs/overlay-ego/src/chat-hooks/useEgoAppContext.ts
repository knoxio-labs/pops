import { useLocation } from 'react-router';

import { useAppContext, useCurrentEntity } from '@pops/navigation';

import type { EgoChatData } from '../ego-api/types.gen';

/** The `appContext` field of the ego chat request body. */
export type EgoAppContext = NonNullable<NonNullable<EgoChatData['body']>['appContext']>;

const ENTITY_URI = /^pops:[^/]+\/[^/]+\/(.+)$/;

/**
 * Maps the shell's active app, route and viewed entity onto the ego chat wire
 * shape. Returns `undefined` when no app is active (root or unmatched paths),
 * so callers omit `appContext` rather than send an empty one. `entityId` is the
 * id segment of the entity's `pops:{app}/{type}/{id}` URI; a parsed entity
 * also carries its original URI. An entity whose URI does not parse contributes
 * no entity fields, including no URI.
 */
export function useEgoAppContext(): EgoAppContext | undefined {
  const { app } = useAppContext();
  const entity = useCurrentEntity();
  const { pathname } = useLocation();

  if (!app) return undefined;

  const entityId = entity ? ENTITY_URI.exec(entity.uri)?.[1] : undefined;
  if (!entity || !entityId) return { app, route: pathname };

  return {
    app,
    route: pathname,
    uri: entity.uri,
    entityType: entity.type,
    entityId,
    entityTitle: entity.title,
  };
}
