/** Verbatim source fixture shared by the gateway's schema and replay tests. */
export const sourceText = '  Informação\n  原文\t  ';
/** Stable caller-owned command identity; adapters must never replace it. */
export const operationId = '962d860b-862d-4ad2-8d3a-9df034c7b328';
/** A canonical-shaped persisted source, distinct from a route visit or collection membership. */
export const capture = {
  id: 1,
  tripId: 7,
  originalText: sourceText,
  originalUrl: null,
  attachments: [],
  title: null,
  notes: '',
  classification: null,
  placeId: null,
  visitId: null,
  revision: 1,
  removedAt: null,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};
/** Consistent source snapshot with no inferred route association. */
export const workspace = {
  captures: [capture],
  ideas: [],
  associations: [],
  memberships: [],
  events: [],
  journeys: [],
  stays: [],
};
/** Published receipt/current separation, including historical Undo/replay flags. */
export const operationResult = {
  receipt: { ...workspace, operationId, undoneOperationId: null },
  current: workspace,
  replayed: false,
  undone: false,
};
/** Original creation and later metadata are distinct even when they refer to the same persisted Trip. */
export const tripCreationResult = {
  receipt: {
    operationId,
    trip: {
      id: 7,
      name: 'Original',
      destination: '',
      when: sourceText,
      tagId: null,
      parentId: null,
      notes: '',
      sourceLinks: [],
      createdAt: capture.createdAt,
      updatedAt: capture.updatedAt,
    },
  },
  current: {
    trip: {
      id: 7,
      name: 'Edited',
      destination: '',
      when: sourceText,
      tagId: null,
      parentId: null,
      notes: '',
      sourceLinks: [],
      createdAt: capture.createdAt,
      updatedAt: capture.updatedAt,
    },
  },
  replayed: true,
};
