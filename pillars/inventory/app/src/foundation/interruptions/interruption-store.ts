import { useSyncExternalStore } from 'react';

export type Interruption = 'reload-required' | 'session-expired';

export const RELOAD_REQUIRED_REASON = 'Reload to keep making changes';

export interface ReportedResponse {
  readonly status: number;
  readonly url: string;
}

const TYPE_CATALOGUE_PATH = /(^|\/)type-catalogue(\/|$)/;
const listeners = new Set<() => void>();
const serverSnapshot = (): Interruption | null => null;

let currentInterruption: Interruption | null = null;
let reloadRequiredSeen = false;
let sessionConfirmed = false;

function typeCataloguePath(url: string): boolean {
  try {
    const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
    return TYPE_CATALOGUE_PATH.test(new URL(url, origin).pathname);
  } catch {
    return false;
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Interruption | null {
  return currentInterruption;
}

export function reportResponse(response: ReportedResponse | undefined): void {
  if (response === undefined) return;

  if (response.status >= 200 && response.status < 300 && typeCataloguePath(response.url)) {
    sessionConfirmed = true;
    return;
  }

  if (response.status === 426) {
    reloadRequiredSeen = true;
    if (currentInterruption === null) {
      currentInterruption = 'reload-required';
      notify();
    }
    return;
  }

  if (response.status === 401 && sessionConfirmed && currentInterruption !== 'session-expired') {
    currentInterruption = 'session-expired';
    notify();
  }
}

export function useInterruption(): Interruption | null {
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
}

export function reloadRequired(): boolean {
  return reloadRequiredSeen;
}

export function resetInterruption(): void {
  const changed = currentInterruption !== null;
  currentInterruption = null;
  reloadRequiredSeen = false;
  sessionConfirmed = false;
  if (changed) notify();
}
