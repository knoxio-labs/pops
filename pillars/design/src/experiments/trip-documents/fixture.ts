import { initialDocumentLinking } from '../trip-document-linking/fixture';
import { canvasName, initialCanvas } from '../trip-route-editing/canvas-model';

import type { DocumentOfflineFact, TripDocumentsScenario, TripDocumentsState } from './types';

/** Named fictional document ledger review scenarios. */
export type { TripDocumentsScenario } from './types';

function sourceOfflineFacts(): DocumentOfflineFact[] {
  return [
    {
      documentId: 'document-confirmation',
      status: 'ready',
      source: 'Fictional offline ledger',
      detail: 'Recorded ready in the fictional source snapshot.',
      recordedAt: '2027-12-20T09:00:00Z',
    },
    {
      documentId: 'document-hotel',
      status: 'not-downloaded',
      source: 'Fictional offline ledger',
      detail: 'No local download was recorded.',
    },
    {
      documentId: 'document-unavailable',
      status: 'failed',
      source: 'Fictional offline ledger',
      detail: 'The recorded offline attempt failed.',
    },
  ];
}

function sourceTargetVisits(): TripDocumentsState['targetVisits'] {
  return [
    { id: 'outbound-departure', targetId: 'journey-brazil', visitId: 'sydney-out' },
    { id: 'outbound-arrival', targetId: 'journey-brazil', visitId: 'arrival' },
    { id: 'hotel-visit', targetId: 'stay-olinda', visitId: 'recife' },
    { id: 'station-visit', targetId: 'visit-curitiba', visitId: 'curitiba' },
    { id: 'birthday-visit', targetId: 'event-birthday', visitId: 'curitiba' },
  ];
}

/** Reuses original D09 metadata and explicit fictional associations; no fixture represents an accessible real file. */
export function createTripDocumentsState(
  scenario: TripDocumentsScenario = 'default'
): TripDocumentsState {
  const sourceScenario =
    scenario === 'empty' || scenario === 'unavailable' || scenario === 'missing-reference'
      ? scenario
      : 'default';
  const linking = initialDocumentLinking(sourceScenario);
  const canvas = initialCanvas('default');
  const state: TripDocumentsState = {
    linking,
    visits: canvas.order.flatMap((id) => {
      const record = canvas.records.find((entry) => entry.id === id);
      return record?.kind === 'city'
        ? [
            {
              id,
              name: canvasName(canvas, record),
              from: record.timing?.arrival ?? '',
              to: record.timing?.departure ?? '',
            },
          ]
        : [];
    }),
    targetVisits: sourceTargetVisits(),
    offline: sourceOfflineFacts(),
    provenance: linking.documents.map((document) => ({
      documentId: document.id,
      source: 'Fictional D09 document catalogue',
    })),
  };
  if (scenario === 'empty') return { ...state, offline: [], provenance: [] };
  if (scenario === 'duplicate-names')
    linking.documents = linking.documents.map((document) =>
      document.id === 'document-hotel'
        ? { ...document, title: 'Brazil flight confirmation', fileName: 'flight-confirmation.pdf' }
        : document
    );
  if (scenario === 'offline') {
    state.offline.push({
      documentId: 'document-image',
      status: 'stale',
      source: 'Fictional offline ledger',
      detail: 'A newer original was recorded after the local copy.',
    });
    linking.links.push({
      id: 'link-image-trip',
      documentId: 'document-image',
      targetId: 'trip-brazil',
    });
  }
  if (scenario === 'missing-reference')
    linking.links.push({
      id: 'link-missing-target',
      documentId: 'document-hotel',
      targetId: 'removed-target',
    });
  return state;
}
