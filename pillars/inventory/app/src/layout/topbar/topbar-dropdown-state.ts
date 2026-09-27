import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { purchaseHref } from '../../inventory-web/purchase-model.js';
import { recordOpened, recordQuery } from '../../inventory-web/recents.js';
import {
  isPlainTopbarTab,
  moveTopbarActive,
  parseTopbarRecord,
  type TypeaheadRow,
} from './topbar-rows.js';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { SearchDropdownProps } from '@pops/navigation';
import type { PaletteCommand } from '@pops/ui';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PurchaseHit } from '../../inventory-web/purchase-model.js';
import type { SearchScope } from '../../pages/search/search-model.js';

/** Props shared by the rendered inventory dropdown and its keyboard controller. */
export interface TopbarDropdownProps extends SearchDropdownProps {
  readonly scope: SearchScope;
  readonly rows: readonly TypeaheadRow[];
  readonly purchases: readonly PurchaseHit[];
  readonly recentQueries: readonly string[];
  readonly recentRecords: readonly PaletteCommand[];
  readonly world: PlacementWorld;
  readonly totals: Readonly<Record<SearchScope, number>>;
  readonly onScope: (scope: SearchScope) => void;
  readonly emptyState: import('react').ReactElement | null;
  readonly footer: import('react').ReactElement;
}

/** The state and actions needed to render one inventory TopBar dropdown. */
export interface TopbarDropdownModel {
  readonly typed: boolean;
  readonly activeIndex: number;
  readonly optionId: (index: number) => string;
  readonly onRecord: (record: PaletteCommand) => void;
  readonly onOpen: (index: number) => void;
}

function entryCount(props: TopbarDropdownProps, typed: boolean): number {
  if (!typed) return props.recentQueries.length + props.recentRecords.length;
  return props.scope === 'inventory' ? props.rows.length : Math.min(8, props.purchases.length);
}

interface EntryActions {
  readonly props: TopbarDropdownProps;
  readonly query: string;
  readonly typed: boolean;
  readonly navigate: ReturnType<typeof useNavigate>;
  readonly openRecord: (entryId: string, typedQuery: boolean) => boolean;
}

function openEntry(index: number, actions: EntryActions): boolean {
  const { props, query, typed, navigate, openRecord } = actions;
  if (!typed) {
    if (index < props.recentQueries.length) {
      const recentQuery = props.recentQueries[index];
      if (recentQuery === undefined) return false;
      props.setQuery(recentQuery);
      return true;
    }
    const record = props.recentRecords[index - props.recentQueries.length];
    return record === undefined ? false : openRecord(record.id, false);
  }
  if (props.scope === 'inventory') {
    const row = props.rows[index];
    if (row === undefined) return false;
    const id = row.kind === 'place' ? `place:${row.place.id}` : `item:${row.hit.item.id}`;
    return openRecord(id, true);
  }
  const hit = props.purchases[index];
  if (hit === undefined) return false;
  recordQuery(query);
  void navigate(purchaseHref(hit.id));
  props.close();
  return true;
}

interface EnterKeyArgs {
  readonly event: ReactKeyboardEvent<HTMLInputElement>;
  readonly activeIndex: number;
  readonly count: number;
  readonly scope: SearchScope;
  readonly navigate: ReturnType<typeof useNavigate>;
  readonly close: () => void;
  readonly openEntryForIndex: (index: number) => boolean;
}

function enterKey({
  event,
  activeIndex,
  count,
  scope,
  navigate,
  close,
  openEntryForIndex,
}: EnterKeyArgs): boolean {
  if (activeIndex >= 0 && activeIndex < count) return openEntryForIndex(activeIndex);
  const text = event.currentTarget.value.trim();
  if (text === '') return false;
  recordQuery(text);
  const scopeQuery = scope === 'purchases' ? '&scope=purchases' : '';
  void navigate(`/inventory/search?q=${encodeURIComponent(text)}${scopeQuery}`);
  close();
  return true;
}

interface KeyHandlerArgs {
  readonly props: TopbarDropdownProps;
  readonly typed: boolean;
  readonly count: number;
  readonly activeIndex: number;
  readonly setActive: (index: number) => void;
  readonly resetActive: () => void;
  readonly openEntryForIndex: (index: number) => boolean;
  readonly navigate: ReturnType<typeof useNavigate>;
}

function createKeyHandler({
  props,
  typed,
  count,
  activeIndex,
  setActive,
  resetActive,
  openEntryForIndex,
  navigate,
}: KeyHandlerArgs): (event: ReactKeyboardEvent<HTMLInputElement>) => boolean {
  return (event): boolean => {
    if (event.key === 'Escape') {
      props.close();
      return true;
    }
    if (moveTopbarActive(event, count, activeIndex, setActive)) return true;
    if (event.key === 'Enter') {
      return enterKey({
        event,
        activeIndex,
        count,
        scope: props.scope,
        navigate,
        close: props.close,
        openEntryForIndex,
      });
    }
    if (isPlainTopbarTab(event) && typed) {
      props.onScope(props.scope === 'inventory' ? 'purchases' : 'inventory');
      resetActive();
      return true;
    }
    return false;
  };
}

/** Connects inventory dropdown data to its keyboard and navigation behaviour. */
export function useTopbarDropdownModel(props: TopbarDropdownProps): TopbarDropdownModel {
  const navigate = useNavigate();
  const { keyHandlerRef, setActiveDescendant } = props;
  const [activeIndex, setActiveIndex] = useState(-1);
  const typed = props.query.trim() !== '';
  const count = entryCount(props, typed);
  const optionId = (index: number): string => `${props.listboxId}-option-${index}`;
  const resetActive = (): void => {
    setActiveIndex(-1);
    setActiveDescendant(undefined);
  };
  const setActive = (index: number): void => {
    setActiveIndex(index);
    setActiveDescendant(optionId(index));
  };
  const openRecord = (entryId: string, typedQuery: boolean): boolean => {
    const record = parseTopbarRecord(entryId);
    if (record === null) return false;
    if (typedQuery) recordQuery(props.query);
    recordOpened({ kind: record.kind === 'place' ? 'location' : 'item', id: record.id });
    void navigate(record.href);
    props.close();
    return true;
  };
  const onRecord = (record: PaletteCommand): void => {
    void openRecord(record.id, false);
  };
  const openEntryForIndex = (index: number): boolean =>
    openEntry(index, {
      props,
      query: props.query,
      typed,
      navigate,
      openRecord,
    });
  const onOpen = (index: number): void => {
    void openEntryForIndex(index);
  };
  const onKey = createKeyHandler({
    props,
    typed,
    count,
    activeIndex,
    setActive,
    resetActive,
    openEntryForIndex,
    navigate,
  });
  useEffect(() => {
    keyHandlerRef.current = onKey;
    return () => {
      keyHandlerRef.current = null;
    };
  }, [keyHandlerRef, onKey]);
  useEffect(() => () => setActiveDescendant(undefined), [setActiveDescendant]);
  return { typed, activeIndex, optionId, onRecord, onOpen };
}
