import { createContext, useContext } from 'react';

import type { CanvasState } from '../trip-route-editing/canvas-model';

/** Local references stand in for separately owned Places, Contacts and Documents identities. */
export interface EventReference {
  id: string;
  kind: 'venue' | 'contact' | 'document';
  name: string;
  address?: string;
  url?: string;
}

/** Additional event source fields remain separate from route membership and purchase state. */
export interface EventMetadata {
  venueId?: string;
  organiserId?: string;
  sourceUrl?: string;
  ticketUrl?: string;
  startTime?: string;
  endTime?: string;
  timeZone?: string;
  documentIds: string[];
}

/** Serializable prototype snapshot; one undo history owns event fields and route mutations. */
export interface EventWorkspaceState {
  canvas: CanvasState;
  eventId: string;
  metadata: EventMetadata;
  references: EventReference[];
}

/** Metadata actions share the same local snapshot history as canvas mutations. */
export interface EventDetailsActions {
  data: EventWorkspaceState;
  change: (next: EventWorkspaceState) => void;
}

/** Prototype-local source metadata; no connected records are written by this context. */
export const EventDetailsContext = createContext<EventDetailsActions | null>(null);

/** Read typed venue, organiser, document and source fields for the selected event. */
export function useEventDetails(): EventDetailsActions {
  const context = useContext(EventDetailsContext);
  if (!context) throw new Error('Event details provider required');
  return context;
}

/** Only explicit HTTP(S) links become navigation targets; invalid values remain editable source text. */
export function eventLink(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}
