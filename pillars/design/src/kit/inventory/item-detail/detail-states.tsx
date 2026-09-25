import {
  brokenPhotos,
  televisionDocumentsOneMissing,
} from '@/fixtures/inventory/item-detail-content';
import { overriddenValue } from '@/fixtures/inventory/item-detail-content';
/**
 * Every item page state (spec 2.4 and 3.8) for one E1 layout, so the main
 * screen and both experiment variants stage the same states from the same
 * fixtures and differ only in layout.
 */
import {
  blenderStale,
  destroyedPhone,
  discardedSpeaker,
  drillOnWorkbench,
  groupedCables,
  headphonesInHand,
  kettleInBox,
  lostUmbrella,
  printerNoProvenance,
  retiredCamera,
  richTelevision,
  routerConflicted,
  sparseLadder,
  tapeInHand,
} from '@/fixtures/inventory/item-states';
import { recentPlacements } from '@/fixtures/inventory/recents';

import { ItemDetailProblem, ItemDetailSkeleton } from './detail-fallbacks';
import { ItemDetailPage } from './item-detail-page';

import type { ComponentType } from 'react';

import type { DetailCondition, DetailLayout, ItemDetailModel } from './detail-model';
import type { ItemDetailPageProps } from './item-detail-page';

type Extra = Omit<ItemDetailPageProps, 'model' | 'condition' | 'layout'>;

/** One state: the page for a model under a condition, in the given layout. */
export function detailState(
  layout: DetailLayout,
  model: ItemDetailModel,
  condition: DetailCondition = {},
  extra: Extra = {}
): ComponentType {
  return function DetailState() {
    return (
      <ItemDetailPage
        model={model}
        condition={condition}
        layout={layout}
        recents={recentPlacements}
        {...extra}
      />
    );
  };
}

const tv = richTelevision;
const withFacts = (model: ItemDetailModel, facts: ItemDetailModel['facts']): ItemDetailModel => ({
  ...model,
  facts,
});
const overridden = withFacts(
  tv,
  tv.facts.map((f) => (f.key === 'replacement_value' ? overriddenValue : f))
);
const pending: ItemDetailModel = {
  ...tv,
  item: { ...tv.item, sync: 'sending' },
  facts: tv.facts.map((f) => (f.key === 'manufacturer' ? { ...f, value: 'LG Electronics' } : f)),
};

type Maker = (model: ItemDetailModel, condition?: DetailCondition, extra?: Extra) => ComponentType;

function placementAndLifecycle(s: Maker): Record<string, ComponentType> {
  return {
    rich: s(tv, { openSection: 'connections' }),
    sparse: s(sparseLadder),
    grouped: s(groupedCables),
    'direct-location': s(drillOnWorkbench, { openSection: 'provenance' }),
    contained: s(kettleInBox),
    'in-hand': s(tapeInHand),
    'in-hand-previous-deleted': s(headphonesInHand),
    retired: s(retiredCamera),
    discarded: s(discardedSpeaker),
    lost: s(lostUmbrella),
    destroyed: s(destroyedPhone),
  };
}

function editsAndData(s: Maker): Record<string, ComponentType> {
  return {
    'inline-editing': s(tv, { editingKey: 'manufacturer', editingDraft: 'LG Electronics' }),
    saving: s(tv, {
      editingKey: 'manufacturer',
      savingKey: 'manufacturer',
      editingDraft: 'LG Electronics',
    }),
    'queued-edit': s(pending, { pendingKey: 'manufacturer' }),
    'edit-rejected': s(tv, {
      rejection: {
        key: 'ports',
        reason: 'Ports must be a whole number from 0 to 16. It went back to 4.',
      },
    }),
    'computed-overridden': s(overridden),
    stale: s(blenderStale, { banner: 'stale' }),
    'conflicting-change': s(routerConflicted, {
      conflict: {
        label: 'Manufacturer',
        mine: 'Netgear',
        theirs: 'TP-Link',
        theirsBy: "Joao's iPhone",
      },
    }),
    'needs-attention': s(routerConflicted, { banner: 'needs-attention' }),
    offline: s(tv, { banner: 'offline' }),
    'missing-paperless': s(
      { ...tv, documents: televisionDocumentsOneMissing },
      { openSection: 'documents' }
    ),
    'paperless-down': s({ ...tv, paperless: 'unreachable' }, { openSection: 'documents' }),
    'paperless-not-connected': s(
      { ...tv, paperless: 'not-configured', documents: [] },
      { openSection: 'documents' }
    ),
    'broken-photo': s({ ...tv, photos: brokenPhotos }, { brokenPhoto: true }),
    'no-provenance': s(printerNoProvenance, { openSection: 'provenance' }),
    'more-menu': s(tv, { menuOpen: true }),
    'move-picker': s(tv, { pickerOpen: true }),
    'moved-undo': s(tv, { toast: { concept: 'move', message: 'Moved Television to Garage' } }),
  };
}

/** The item states for one layout. */
export function itemDetailStates(layout: DetailLayout): Record<string, ComponentType> {
  const s: Maker = (model, condition, extra) => detailState(layout, model, condition, extra);
  return {
    ...placementAndLifecycle(s),
    ...editsAndData(s),
    loading: () => <ItemDetailSkeleton />,
    error: () => <ItemDetailProblem variant="error" />,
    'not-found': () => <ItemDetailProblem variant="not-found" />,
    tablet: () => (
      <div className="mx-auto w-full max-w-164">
        <ItemDetailPage
          model={tv}
          layout={layout}
          recents={recentPlacements}
          condition={{ openSection: 'connections' }}
        />
      </div>
    ),
  };
}
