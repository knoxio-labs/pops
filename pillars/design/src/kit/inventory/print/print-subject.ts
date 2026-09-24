/**
 * What the label page needs to know about one item to print it. A container
 * is an item with the containment capability (ADR-001), so boxes and the
 * things in them share this shape and differ only in `kind`.
 */
export interface PrintSubject {
  /** The item's immutable id; the QR encodes it, never the code. */
  id: string;
  name: string;
  /** The inventory code, or null when the item has never been labelled. */
  code: string | null;
  /**
   * What `POST /codes/suggest` offers for an item with no code: the stem of
   * similar items plus the next free number. Null when the item has a code.
   */
  suggestedCode: string | null;
  kind: 'container' | 'item';
  /** Where it is, as the label words it: a location for a box, the box for a packed item. */
  place: string | null;
  /** The number of things the record stands for; a group still gets one label. */
  quantity: number;
}

/** The QR payload for an item, per ADR-002 D13: `pops://inventory/item/<id>`. */
export function itemUri(id: string): string {
  return `pops://inventory/item/${id}`;
}

/** The two templates: a container label (QR, name, code, place) and an item label (QR, code). */
export type LabelTemplateId = 'container' | 'item';
