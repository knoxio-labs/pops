import { useMemo } from 'react';

import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { buildWorld } from '../model/placement-model.js';
import { PlacementPicker } from '../placement-picker/placement-picker.js';

import type { ReactElement } from 'react';

import type { PlacementWorld } from '../model/placement-model.js';
import type { ContentsVerbs } from './use-contents-verbs.js';

function mergedWorld(page: PlacementWorld, source: PlacementWorld): PlacementWorld {
  const items = new Map(source.items);
  for (const item of page.items.values()) items.set(item.id, item);
  const locations = new Map(source.locations);
  for (const location of page.locations.values()) locations.set(location.id, location);
  return buildWorld([...items.values()], [...locations.values()]);
}

/** Anchors the controlled item Move picker under the current contents surface. */
export function MoveItemsAnchor({
  verbs,
  world,
}: {
  verbs: ContentsVerbs;
  world: PlacementWorld;
}): ReactElement {
  const moving = verbs.moving;
  const subject = useMemo(() => ({ kind: 'items' as const, ids: moving ?? [] }), [moving]);
  const sources = usePlacementSources(subject);
  const pickerWorld = useMemo(() => mergedWorld(world, sources.world), [sources.world, world]);
  return (
    <PlacementPicker
      world={pickerWorld}
      subject={subject}
      recents={sources.recents}
      open={verbs.moving !== null}
      onOpenChange={(open) => {
        if (!open) verbs.cancelMove();
      }}
      onPick={(target) => verbs.moveTo(target, pickerWorld)}
      onCreatePlace={(name, parentId) => sources.createLocation.mutate({ name, parentId })}
      trigger={<span aria-hidden className="fixed right-1/3 bottom-28 size-px" />}
    />
  );
}
