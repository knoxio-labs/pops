import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useItemVerbs, type ItemVerbs } from '../../inventory-web/item-verbs';
import { createDoneHandler } from './detail-action-dialogs';
import { createMutationRunner } from './detail-action-helpers';
import { createDetailKeyHandlers } from './detail-action-keys';
import {
  createMenuHandler,
  createPickHandler,
  createVerbHandler,
  type DetailVerbHandlerContext,
} from './detail-action-verbs';
import { detailVerbs, type DetailVerb, type DetailVerbs, type MenuEntry } from './detail-verbs';

import type { NavigateFunction } from 'react-router';

import type { ItemRowModel, PlacementTarget, PlacementWorld } from '../../foundation/model';
import type { ShortcutHandlers } from '../../foundation/shortcuts/shortcut-provider';
import type { DetailDialog, DoneAct } from './detail-dialogs';

/** The placement and item state needed by item-detail actions. */
export interface DetailActionModel {
  item: ItemRowModel;
  world: PlacementWorld;
}

/** Optional router state retained while moving between neighbouring detail pages. */
export interface DetailTrailState {
  listTrail: {
    listName: string;
    href: string;
    ids: readonly string[];
  };
}

/** The current item position in the list that opened its detail page. */
export interface DetailTrailPosition {
  listName: string;
  href: string;
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
  trailState?: DetailTrailState;
}

/** State and handlers used by the item-detail header, dialogs, picker, and keyboard scope. */
export interface DetailActions {
  verbs: DetailVerbs;
  dialog: DetailDialog | null;
  setDialog: (dialog: DetailDialog | null) => void;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  storeHereOpen: boolean;
  setStoreHereOpen: (open: boolean) => void;
  /** The last refused action's reason; null when no refusal is being shown. */
  refusal: string | null;
  onVerb: (verb: DetailVerb) => void;
  onMenu: (entry: MenuEntry) => void;
  onPick: (target: PlacementTarget) => void;
  onDone: (done: DoneAct) => void;
  /** Handlers for the page's single detail shortcut scope. */
  keyHandlers: ShortcutHandlers;
}

type DetailHandlerSet = Pick<
  DetailActions,
  'onVerb' | 'onMenu' | 'onPick' | 'onDone' | 'keyHandlers'
>;

interface DetailHandlerInput {
  model: DetailActionModel;
  itemVerbs: ItemVerbs;
  verbs: DetailVerbs;
  position: DetailTrailPosition | null;
  navigate: NavigateFunction;
  setDialog: (dialog: DetailDialog | null) => void;
  setPickerOpen: (open: boolean) => void;
  setStoreHereOpen: (open: boolean) => void;
  setRefusal: (reason: string | null) => void;
}

function createDetailHandlers(input: DetailHandlerInput): DetailHandlerSet {
  const onOpenHistory = (): void => {
    void input.navigate(`/inventory/items/${input.model.item.id}/history`);
  };
  const runMutation = createMutationRunner(input.setRefusal, onOpenHistory);
  const context: DetailVerbHandlerContext = {
    item: input.model.item,
    world: input.model.world,
    itemVerbs: input.itemVerbs,
    navigate: input.navigate,
    runMutation,
    setRefusal: input.setRefusal,
    setDialog: input.setDialog,
    setPickerOpen: input.setPickerOpen,
    setStoreHereOpen: input.setStoreHereOpen,
  };
  const onVerb = createVerbHandler(context);
  const onMenu = createMenuHandler(context);
  const onPick = createPickHandler(context);
  const onDone = createDoneHandler({
    item: input.model.item,
    itemVerbs: input.itemVerbs,
    runMutation,
    setDialog: input.setDialog,
    setRefusal: input.setRefusal,
    setPickerOpen: input.setPickerOpen,
  });
  const keyHandlers = createDetailKeyHandlers({
    item: input.model.item,
    verbs: input.verbs,
    position: input.position,
    navigate: input.navigate,
    onVerb,
    onMenu,
  });
  return { onVerb, onMenu, onPick, onDone, keyHandlers };
}

/** Binds the item-detail verb model to mutations, dialogs, navigation, and shortcuts. */
export function useDetailActions(
  model: DetailActionModel,
  position: DetailTrailPosition | null,
  offline: boolean
): DetailActions {
  const navigate = useNavigate();
  const itemVerbs = useItemVerbs();
  const [dialog, setDialog] = useState<DetailDialog | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [storeHereOpen, setStoreHereOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const verbs = detailVerbs(model.item, model.world, { offline });
  const handlers = createDetailHandlers({
    model,
    itemVerbs,
    verbs,
    position,
    navigate,
    setDialog,
    setPickerOpen,
    setStoreHereOpen,
    setRefusal,
  });

  return {
    verbs,
    dialog,
    setDialog,
    pickerOpen,
    setPickerOpen,
    storeHereOpen,
    setStoreHereOpen,
    refusal,
    ...handlers,
  };
}
