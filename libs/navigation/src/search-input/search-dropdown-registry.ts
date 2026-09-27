import { useSyncExternalStore } from 'react';

import type { ComponentType, KeyboardEvent as ReactKeyboardEvent, MutableRefObject } from 'react';

import type { PillarId } from '@pops/pillar-sdk';

/** Props supplied to an app-owned TopBar search dropdown. */
export interface SearchDropdownProps {
  /** The search store's query: already debounced 300ms by `handleChange`. */
  query: string;
  /** The listbox id owned by the shared search input. */
  listboxId: string;
  /** Writes a recent query to the input and the shared search store. */
  setQuery: (query: string) => void;
  /** Closes the shared search input while preserving its query and text. */
  close: () => void;
  /** Ref through which the dropdown hands keyboard events back to the input. */
  keyHandlerRef: MutableRefObject<
    ((event: ReactKeyboardEvent<HTMLInputElement>) => boolean) | null
  >;
  /** Sets the active option id used by the input's `aria-activedescendant`. */
  setActiveDescendant: (id: string | undefined) => void;
}

/** Registration metadata for one app's TopBar search dropdown. */
export interface SearchDropdownRegistration {
  /** The app-owned dropdown component rendered below the shared input. */
  Dropdown: ComponentType<SearchDropdownProps>;
  /** The shared input placeholder while this app is open. */
  placeholder?: string;
  /** The empty-input keyboard cap while this app is open. */
  hotkeyLabel?: string;
  /** Opens the app's compact search surface below the shared input breakpoint. */
  openCompact?: () => void;
}

interface DropdownStore {
  registrations: Map<PillarId, SearchDropdownRegistration>;
  listeners: Set<() => void>;
}

interface GlobalSearchInputStore {
  input: HTMLInputElement | null;
}

const DROPDOWN_STORE_KEY = Symbol.for('pops.navigation.search-dropdown');
const INPUT_STORE_KEY = Symbol.for('pops.navigation.global-search-input');

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDropdownStore(value: unknown): value is DropdownStore {
  return (
    isRecord(value) &&
    Reflect.get(value, 'registrations') instanceof Map &&
    Reflect.get(value, 'listeners') instanceof Set
  );
}

function isHtmlInputElement(value: unknown): value is HTMLInputElement {
  return typeof HTMLInputElement !== 'undefined' && value instanceof HTMLInputElement;
}

function isGlobalSearchInputStore(value: unknown): value is GlobalSearchInputStore {
  if (!isRecord(value)) return false;
  const input: unknown = Reflect.get(value, 'input');
  return input === null || isHtmlInputElement(input);
}

function dropdownStore(): DropdownStore {
  const existing: unknown = Reflect.get(globalThis, DROPDOWN_STORE_KEY);
  if (isDropdownStore(existing)) return existing;

  const created: DropdownStore = {
    registrations: new Map(),
    listeners: new Set(),
  };
  Reflect.set(globalThis, DROPDOWN_STORE_KEY, created);
  return created;
}

function inputStore(): GlobalSearchInputStore {
  const existing: unknown = Reflect.get(globalThis, INPUT_STORE_KEY);
  if (isGlobalSearchInputStore(existing)) return existing;

  const created: GlobalSearchInputStore = { input: null };
  Reflect.set(globalThis, INPUT_STORE_KEY, created);
  return created;
}

function notify(store: DropdownStore): void {
  for (const listener of store.listeners) listener();
}

/** Registers an app-owned dropdown and returns a stale-safe unregister function. */
export function registerSearchDropdown(
  app: PillarId,
  registration: SearchDropdownRegistration
): () => void {
  const store = dropdownStore();
  store.registrations.set(app, registration);
  notify(store);

  return () => {
    if (store.registrations.get(app) !== registration) return;
    store.registrations.delete(app);
    notify(store);
  };
}

function subscribeSearchDropdowns(listener: () => void): () => void {
  const store = dropdownStore();
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

/** Returns the registered dropdown for an app and updates when any registration changes. */
export function useSearchDropdown(app: PillarId | null): SearchDropdownRegistration | null {
  return useSyncExternalStore(
    subscribeSearchDropdowns,
    () => (app === null ? null : (dropdownStore().registrations.get(app) ?? null)),
    () => null
  );
}

/** Registers the shared TopBar input; the newest mounted input becomes the focus target. */
export function registerGlobalSearchInput(input: HTMLInputElement): () => void {
  const store = inputStore();
  store.input = input;
  return () => {
    if (store.input === input) store.input = null;
  };
}

/** Focuses the registered shared TopBar input, returning false when none is mounted. */
export function focusGlobalSearch(): boolean {
  const input = inputStore().input;
  if (input === null) return false;
  input.focus();
  return true;
}

/** @internal Clears the cross-bundle registry and input target for tests. */
export function _clearSearchDropdowns(): void {
  const store = dropdownStore();
  store.registrations.clear();
  store.listeners.clear();
  inputStore().input = null;
}
