import { initialCanvas } from '../trip-route-editing/canvas-model';

import type { ArrangementPolicy, ArrangementScenario, ArrangementState } from './types';

/** Named fictional ledger review states. */
export type { ArrangementScenario } from './types';

function sourcePolicies(canvas: ArrangementState['canvas']): ArrangementPolicy[] {
  const transport = canvas.records.find((record) => record.kind === 'transport');
  const stay = canvas.records.find((record) => record.kind === 'stay');
  return [
    ...(transport
      ? [
          {
            recordId: transport.id,
            source: 'Fictional ticket conditions',
            notes: 'Change fee excludes any fare difference.',
            changeCost: { amount: 180, currency: 'AUD' },
            cancellation: { at: '2027-11-23T10:00:00+11:00', timeZone: 'Australia/Sydney' },
          },
        ]
      : []),
    ...(stay
      ? [
          {
            recordId: stay.id,
            source: 'Fictional reservation conditions',
            notes: 'Recorded cancellation deadline; other conditions have not been captured.',
            cancellation: { at: '2027-12-27T17:00:00-03:00', timeZone: 'America/Recife' },
          },
        ]
      : []),
  ];
}

function sourceResponsibilities(
  canvas: ArrangementState['canvas']
): ArrangementState['responsibilities'] {
  const transport = canvas.records.find((record) => record.kind === 'transport');
  const stay = canvas.records.find((record) => record.kind === 'stay');
  return [
    ...(transport ? [{ recordId: transport.id, contactId: 'contact-self' }] : []),
    ...(stay ? [{ recordId: stay.id, contactId: 'contact-clara' }] : []),
  ];
}

/** Reuses the actual fictional canvas and calendar sources; policy examples are explicit fictional evidence. */
export function createArrangementState(
  scenario: ArrangementScenario = 'default'
): ArrangementState {
  const canvas = initialCanvas(scenario === 'empty' ? 'empty' : 'default');
  const state: ArrangementState = {
    canvas,
    policies: sourcePolicies(canvas),
    referenceAt: '2027-12-20T09:00:00Z',
    contacts: [
      { id: 'contact-self', name: 'Alex Costa', self: true },
      { id: 'contact-clara', name: 'Clara Silva', self: false },
    ],
    responsibilities: sourceResponsibilities(canvas),
  };
  if (scenario === 'unknown-dates') {
    canvas.records = canvas.records.map((record) => ({
      ...record,
      timing: undefined,
      schedule: undefined,
    }));
    canvas.rentals = canvas.rentals.map((rental) => ({ ...rental, start: '', end: '' }));
  }
  if (scenario === 'missing-reference') {
    canvas.records = canvas.records.map((record) =>
      record.kind === 'stay' ? { ...record, visitId: 'removed-visit' } : record
    );
    state.responsibilities = state.responsibilities.map((entry) =>
      entry.contactId === 'contact-clara' ? { ...entry, contactId: 'removed-contact' } : entry
    );
  }
  if (scenario === 'invalid-policy')
    state.policies = state.policies.map((policy) => ({
      ...policy,
      changeCost: { amount: -1, currency: '' },
      cancellation: { at: '2027-02-30T10:00:00Z', timeZone: 'Invalid/Zone' },
    }));
  return state;
}
