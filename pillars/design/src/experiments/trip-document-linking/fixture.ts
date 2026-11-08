import type { DocumentLinkingState } from './model';

/** Fictional snapshots for existing documents, blank capture, unavailable sources and broken references. */
export type DocumentLinkingScenario = 'default' | 'empty' | 'unavailable' | 'missing-reference';

function sourceDocuments(): DocumentLinkingState['documents'] {
  return [
    {
      id: 'document-confirmation',
      title: 'Brazil flight confirmation',
      fileName: 'flight-confirmation.pdf',
      mimeType: 'application/pdf',
      size: 184320,
      availability: 'available',
    },
    {
      id: 'document-hotel',
      title: 'Olinda hotel reservation',
      fileName: 'olinda-reservation.pdf',
      mimeType: 'application/pdf',
      size: 98304,
      availability: 'available',
    },
    {
      id: 'document-image',
      title: 'Curitiba station map',
      fileName: 'station-map.png',
      mimeType: 'image/png',
      size: 327680,
      availability: 'available',
    },
    {
      id: 'document-unavailable',
      title: 'Previous itinerary',
      fileName: 'previous-itinerary.pdf',
      mimeType: 'application/pdf',
      size: 65536,
      availability: 'unavailable',
    },
  ];
}

/** Returns independent local records; no fixture file is presented as an uploaded or accessible real document. */
export function initialDocumentLinking(
  scenario: DocumentLinkingScenario = 'default'
): DocumentLinkingState {
  const state: DocumentLinkingState = {
    documents: sourceDocuments(),
    targets: [
      { id: 'trip-brazil', label: 'Brazil', kind: 'trip' },
      { id: 'journey-brazil', label: 'SYD → DFW → GRU', kind: 'journey' },
      { id: 'stay-olinda', label: 'Olinda · Pousada do Carmo', kind: 'stay' },
      { id: 'visit-curitiba', label: 'Curitiba', kind: 'visit' },
      { id: 'event-birthday', label: 'Birthday dinner', kind: 'event' },
    ],
    links: [
      {
        id: 'link-flight-journey',
        documentId: 'document-confirmation',
        targetId: 'journey-brazil',
      },
      { id: 'link-flight-trip', documentId: 'document-confirmation', targetId: 'trip-brazil' },
      { id: 'link-hotel-stay', documentId: 'document-hotel', targetId: 'stay-olinda' },
    ],
    targetId: 'journey-brazil',
    selectedIds: [],
    files: [],
    query: '',
  };
  if (scenario === 'empty') return { ...state, documents: [], links: [] };
  if (scenario === 'unavailable')
    return {
      ...state,
      links: [
        ...state.links,
        { id: 'link-unavailable', documentId: 'document-unavailable', targetId: state.targetId },
      ],
    };
  if (scenario === 'missing-reference')
    return {
      ...state,
      targetId: 'target-removed',
      links: [
        ...state.links,
        { id: 'link-removed-document', documentId: 'document-removed', targetId: 'journey-brazil' },
      ],
    };
  return state;
}
