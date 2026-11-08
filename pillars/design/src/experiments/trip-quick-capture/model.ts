/** Optional classification chosen explicitly by the person capturing a source. */
export type CaptureKind = 'idea' | 'note' | 'event' | 'link' | 'document';

/** Presentation catalogue for the prototype's explicit classification choices. */
export const captureKinds: readonly { id: CaptureKind; label: string }[] = [
  { id: 'idea', label: 'Idea' },
  { id: 'note', label: 'Note' },
  { id: 'event', label: 'Event' },
  { id: 'link', label: 'Link' },
  { id: 'document', label: 'Document' },
];

/** Local source material and explicit selections; files remain browser File objects. */
export interface CaptureDraft {
  text: string;
  kind?: CaptureKind;
  visitId: string;
  url: string;
  files: File[];
}

/** Captured source with optional manually entered organisation fields. */
export interface CapturedItem extends CaptureDraft {
  id: string;
  title: string;
  start: string;
  end: string;
}

/** In-memory prototype state; nothing here uploads or persists source material. */
export interface CaptureState {
  draft: CaptureDraft;
  items: CapturedItem[];
}

/** Whether the draft contains any material source, independent of optional selections. */
export function hasCapture(draft: CaptureDraft): boolean {
  return Boolean(draft.text.trim() || draft.url.trim() || draft.files.length);
}

/** Captures verbatim source without inference or deduplication, retaining draft selections. */
export function captureItem(state: CaptureState, id: string): CaptureState {
  if (!hasCapture(state.draft)) return state;
  const item: CapturedItem = {
    ...state.draft,
    files: [...state.draft.files],
    id,
    title: '',
    start: '',
    end: '',
  };
  return {
    draft: { ...state.draft, text: '', url: '', files: [] },
    items: [item, ...state.items],
  };
}

/** Human-readable label without truncating or altering the stored source. */
export function captureLabel(item: CapturedItem): string {
  return (
    item.title.trim() ||
    item.text
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ||
    item.files[0]?.name ||
    item.url
  );
}

/** Returns a navigable absolute HTTP(S) URL, rejecting other schemes and relative paths. */
export function safeCaptureLink(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Suggests a link only when the entire trimmed text is an explicit HTTP(S) URL. */
export function candidateLink(text: string): string | undefined {
  const value = text.trim();
  if (!/^https?:\/\/\S+$/i.test(value)) return undefined;
  return safeCaptureLink(value);
}
