/** The compensating operation exposed by reversible place mutations. */
export interface PlaceUndo {
  undo: () => Promise<void>;
}

/** The server-side effects planned for deleting one place. */
export interface PlaceRemoval {
  placeId: string;
  mode: 'reparent' | 'to-hand';
  parentId: string | null;
  subtreeIds: readonly string[];
  thingIds: readonly string[];
}
