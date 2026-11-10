import { expect, it } from 'vitest';

import { visitFindings } from './findings';
import { sourceStay, sourceVisit } from './test-utils';

it('reports reversed dates and only explicit same-visit booking conflicts without mutation', () => {
  const visit = sourceVisit({ timing: { arrival: '2030-04-15', departure: '2030-04-12' } });
  const stay = sourceStay({ status: 'Purchased' });
  expect(visitFindings(visit, [stay, sourceStay({ id: 14, visitId: 32 })])).toEqual([
    { id: 'reversed', kind: 'reversed' },
    { id: 'stay:13', kind: 'outside', name: 'Cedar guesthouse' },
  ]);
  expect(stay).toEqual(sourceStay({ status: 'Purchased' }));
});
it('compares only known valid independent bounds and treats equal boundaries as inside', () => {
  const stay = sourceStay();
  expect(visitFindings(sourceVisit({ timing: {} }), [stay])).toEqual([]);
  expect(visitFindings(sourceVisit({ timing: { arrival: '2030-02-30' } }), [stay])).toEqual([]);
  expect(
    visitFindings(sourceVisit({ timing: { arrival: '2030-04-10', departure: '2030-04-13' } }), [
      stay,
    ])
  ).toEqual([]);
  expect(visitFindings(sourceVisit({ timing: { departure: '2030-04-12' } }), [stay])).toHaveLength(
    1
  );
});
