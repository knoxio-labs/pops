import { useSyncExternalStore } from 'react';

import type { FixedPlacement } from '../foundation/model/model';

export const RECENT_QUERIES_KEY = 'pops.inventory.recents.queries';
export const RECENT_RECORDS_KEY = 'pops.inventory.recents.records';
export const RECENT_PLACEMENTS_KEY = 'pops.inventory.recents.placements';
export const RECENTS_LIMIT = 5;

/** A recently opened inventory record. */
export interface RecentRecord {
  kind: 'item' | 'location';
  id: string;
}

/** Newest-first browser-local inventory recents. */
export interface Recents {
  queries: string[];
  records: RecentRecord[];
  placements: FixedPlacement[];
}

const RECENT_KEYS = new Set([RECENT_QUERIES_KEY, RECENT_RECORDS_KEY, RECENT_PLACEMENTS_KEY]);
const EMPTY_RECENTS: Recents = { queries: [], records: [], placements: [] };
const listeners = new Set<() => void>();

let snapshot: Recents | undefined;
let storageListenerAttached = false;

function localStorageOrUndefined(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readStoredArray(key: string): unknown[] {
  try {
    const raw = localStorageOrUndefined()?.getItem(key);
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredArray(key: string, values: unknown[]): boolean {
  const storage = localStorageOrUndefined();
  if (storage === undefined) return false;

  try {
    storage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

function normalizedQueries(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const query = value.trim();
    const identity = query.toLowerCase();
    if (query === '' || seen.has(identity)) continue;
    seen.add(identity);
    queries.push(query);
    if (queries.length === RECENTS_LIMIT) break;
  }

  return queries;
}

function isRecentRecord(value: unknown): value is RecentRecord {
  if (typeof value !== 'object' || value === null) return false;
  if (!('kind' in value) || !('id' in value)) return false;

  const record = value as { kind?: unknown; id?: unknown };
  return (
    (record.kind === 'item' || record.kind === 'location') &&
    typeof record.id === 'string' &&
    record.id !== ''
  );
}

const recordIdentity = (record: RecentRecord): string => `${record.kind}\u0000${record.id}`;

function normalizedEntries<T>(
  values: readonly unknown[],
  isEntry: (value: unknown) => value is T,
  identity: (value: T) => string
): T[] {
  const seen = new Set<string>();
  const entries: T[] = [];

  for (const value of values) {
    if (!isEntry(value)) continue;
    const key = identity(value);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(value);
    if (entries.length === RECENTS_LIMIT) break;
  }

  return entries;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

function isFixedPlacement(value: unknown): value is FixedPlacement {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;

  const placement = value as { kind?: unknown; locationId?: unknown; containerId?: unknown };
  return placement.kind === 'location'
    ? isNonEmptyString(placement.locationId)
    : placement.kind === 'container' && isNonEmptyString(placement.containerId);
}

function placementIdentity(placement: FixedPlacement): string {
  return placement.kind === 'location'
    ? `location\u0000${placement.locationId}`
    : `container\u0000${placement.containerId}`;
}

/** Read the recent queries, newest first, dropping blank and malformed entries. */
export function readRecentQueries(): string[] {
  return normalizedQueries(readStoredArray(RECENT_QUERIES_KEY));
}

/** Read recently opened records, newest first, dropping malformed entries. */
export function readRecentRecords(): RecentRecord[] {
  return normalizedEntries(readStoredArray(RECENT_RECORDS_KEY), isRecentRecord, recordIdentity);
}

/** Read recently used fixed placements, newest first, dropping malformed entries. */
export function readRecentPlacements(): FixedPlacement[] {
  return normalizedEntries(
    readStoredArray(RECENT_PLACEMENTS_KEY),
    isFixedPlacement,
    placementIdentity
  );
}

function readAllRecents(): Recents {
  return {
    queries: readRecentQueries(),
    records: readRecentRecords(),
    placements: readRecentPlacements(),
  };
}

const sameRecents = (left: Recents, right: Recents) =>
  JSON.stringify(left) === JSON.stringify(right);

function publish(next: Recents): void {
  if (snapshot !== undefined && sameRecents(snapshot, next)) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function recordList<T>(
  key: string,
  current: Recents,
  values: T[],
  replace: (recents: Recents, values: T[]) => Recents
): void {
  if (!writeStoredArray(key, values)) return;
  publish(replace(current, values));
}

/** Put a non-blank query first, preserving its newest spelling and keeping five entries. */
export function recordQuery(query: string): void {
  const trimmed = query.trim();
  if (trimmed === '') return;

  const current = readAllRecents();
  const queries = normalizedQueries([trimmed, ...current.queries]);
  recordList(RECENT_QUERIES_KEY, current, queries, (recents, values) => ({
    ...recents,
    queries: values,
  }));
}

/** Put an opened record first, deduplicating by record kind and identifier. */
export function recordOpened(record: RecentRecord): void {
  if (!isRecentRecord(record)) return;

  const current = readAllRecents();
  const records = normalizedEntries([record, ...current.records], isRecentRecord, recordIdentity);
  recordList(RECENT_RECORDS_KEY, current, records, (recents, values) => ({
    ...recents,
    records: values,
  }));
}

/** Put a fixed placement first, deduplicating by placement kind and identifier. */
export function recordPlacement(target: FixedPlacement): void {
  if (!isFixedPlacement(target)) return;

  const current = readAllRecents();
  const placements = normalizedEntries(
    [target, ...current.placements],
    isFixedPlacement,
    placementIdentity
  );
  recordList(RECENT_PLACEMENTS_KEY, current, placements, (recents, values) => ({
    ...recents,
    placements: values,
  }));
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== null && !RECENT_KEYS.has(event.key)) return;
  publish(readAllRecents());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageListenerAttached && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
      storageListenerAttached = false;
    }
  };
}

function getSnapshot(): Recents {
  const current = readAllRecents();
  if (snapshot === undefined || !sameRecents(snapshot, current)) snapshot = current;
  return snapshot;
}

const getServerSnapshot = (): Recents => EMPTY_RECENTS;

/** All three local recents lists, updated after local recording or a storage event. */
export function useRecents(): Recents {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
