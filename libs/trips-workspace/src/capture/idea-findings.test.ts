import { describe, expect, it } from 'vitest';

import { ideaFindings } from './idea-findings';

import type { Place, Visit } from '../stay/types';
import type { IdeaFindingInput } from './idea-findings';

const idea = (fields: Partial<IdeaFindingInput> = {}): IdeaFindingInput => ({
  id: 41,
  placeId: null,
  visitId: null,
  timing: { mode: 'none' },
  ...fields,
});
const place = (id: number, name: string): Place => ({
  id,
  name,
  sourceLinks: [],
  createdAt: '',
  updatedAt: '',
});
const visit = (id: number, placeId: number, arrival?: string, departure?: string): Visit => ({
  id,
  tripId: 1,
  placeId,
  revision: 0,
  notes: '',
  sourceLinks: [],
  timing: {
    ...(arrival === undefined ? {} : { arrival }),
    ...(departure === undefined ? {} : { departure }),
  },
  createdAt: '',
  updatedAt: '',
});

describe('Idea discrepancy findings', () => {
  it('ignores optional and partial timing while checking only entered dates', () => {
    expect(ideaFindings(idea(), undefined, undefined)).toEqual([]);
    expect(ideaFindings(idea({ timing: { mode: 'dates', from: '2028-01-20' } }), [], [])).toEqual(
      []
    );
    expect(
      ideaFindings(idea({ timing: { mode: 'dates', to: '2028-01-19' }, visitId: 3 }), undefined, [
        visit(3, 9, '2028-01-20'),
      ])
    ).toMatchObject([{ id: 'idea-41-outside-visit', source: { ideaId: 41, visitId: 3 } }]);
  });

  it('reports invalid month and impossible leap dates but accepts a valid leap day', () => {
    expect(
      ideaFindings(idea({ timing: { mode: 'month', month: '2028-13' } }), undefined, undefined).map(
        ({ id }) => id
      )
    ).toEqual(['idea-41-invalid-month']);
    expect(
      ideaFindings(
        idea({ timing: { mode: 'dates', from: '2027-02-29' } }),
        undefined,
        undefined
      ).map(({ id }) => id)
    ).toEqual(['idea-41-invalid-from']);
    expect(
      ideaFindings(idea({ timing: { mode: 'dates', from: '2028-02-29' } }), undefined, undefined)
    ).toEqual([]);
  });

  it('reports reversed idea ranges and checks partial known visit bounds', () => {
    expect(
      ideaFindings(
        idea({ timing: { mode: 'dates', from: '2028-02-29', to: '2028-02-28' } }),
        undefined,
        undefined
      ).map(({ id }) => id)
    ).toEqual(['idea-41-reversed-dates']);
    expect(
      ideaFindings(idea({ visitId: 4 }), undefined, [visit(4, 2, '2028-03-04', '2028-03-01')])
    ).toEqual([]);
    expect(
      ideaFindings(idea({ visitId: 5, timing: { mode: 'dates', from: '2028-03-02' } }), undefined, [
        visit(5, 2, undefined, '2028-03-01'),
      ]).map(({ id }) => id)
    ).toEqual(['idea-41-outside-visit']);
    expect(
      ideaFindings(idea({ visitId: 6, timing: { mode: 'month', month: '2028-02' } }), undefined, [
        visit(6, 2, '2028-03-01'),
      ]).map(({ id }) => id)
    ).toEqual(['idea-41-outside-visit']);
  });

  it('distinguishes unavailable catalogues from missing references and compares place IDs, not names', () => {
    const selected = idea({ placeId: 1, visitId: 8 });
    expect(ideaFindings(selected, undefined, undefined)).toEqual([]);
    expect(ideaFindings(selected, [], [])).toMatchObject([
      { id: 'idea-41-missing-place', source: { ideaId: 41, placeId: 1 } },
      { id: 'idea-41-missing-visit', source: { ideaId: 41, visitId: 8 } },
    ]);
    expect(
      ideaFindings(selected, [place(1, 'Kyoto'), place(2, 'Kyoto')], [visit(8, 2)])
    ).toMatchObject([
      { id: 'idea-41-visit-place', source: { ideaId: 41, placeId: 1, visitId: 8 } },
    ]);
    expect(
      ideaFindings(
        idea({ placeId: 2, visitId: 8 }),
        [place(1, 'Kyoto'), place(2, 'Kyoto')],
        [visit(8, 2)]
      )
    ).toEqual([]);
  });
});
