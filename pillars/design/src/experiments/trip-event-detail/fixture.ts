import { initialCanvas } from '../trip-route-editing/canvas-model';

import type { EventWorkspaceState } from './model';

/** Review incomplete capture, purchased tickets, route conflicts and unavailable reference records. */
export type EventScenario = 'default' | 'new' | 'purchased' | 'date-conflict' | 'missing-reference';

/** Both proposals share one fictional event linked to an alternative visit and reusable references. */
export function initialEventWorkspace(scenario: EventScenario = 'default'): EventWorkspaceState {
  const canvas = initialCanvas('default');
  canvas.records = canvas.records.map((record) => {
    if (record.id === 'minas')
      return { ...record, timing: { arrival: '2028-01-21', departure: '2028-01-25' } };
    if (record.id !== 'festival') return record;
    if (scenario === 'new')
      return { ...record, title: '', placeId: '', schedule: undefined, visitId: undefined };
    if (scenario === 'purchased')
      return { ...record, purchase: 'Purchased', arrangement: 'Booked' };
    if (scenario === 'date-conflict')
      return { ...record, schedule: { start: '2028-01-26', end: '2028-01-27' } };
    return record;
  });
  return {
    canvas,
    eventId: 'festival',
    metadata:
      scenario === 'new'
        ? { documentIds: [] }
        : {
            venueId: scenario === 'missing-reference' ? 'removed-venue' : 'venue-serra',
            organiserId: 'contact-horizonte',
            sourceUrl: 'https://festival-horizonte.example/programme',
            ticketUrl: 'https://festival-horizonte.example/tickets',
            timeZone: 'America/Sao_Paulo',
            documentIds: scenario === 'purchased' ? ['document-ticket'] : [],
          },
    references: [
      {
        id: 'venue-serra',
        kind: 'venue',
        name: 'Centro Cultural da Serra',
        address: 'Rua das Flores, 40 · Belo Horizonte',
      },
      {
        id: 'contact-horizonte',
        kind: 'contact',
        name: 'Horizonte Produções',
        url: 'https://festival-horizonte.example',
      },
      { id: 'document-programme', kind: 'document', name: 'Festival programme.pdf' },
      { id: 'document-ticket', kind: 'document', name: 'Festival ticket.pdf' },
    ],
  };
}
