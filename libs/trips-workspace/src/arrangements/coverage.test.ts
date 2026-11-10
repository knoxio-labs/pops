import { describe, expect, it } from 'vitest';

import { sourceStay, sourceVisit } from '../visit/test-utils';
import { arrangementVisitCoverage } from './coverage';

import type { ArrangementSources } from './types';

describe('Route arrangement coverage findings', () => {
  it('coalesces adjacent idea-only periods into one actionable gap without changing the ideas', () => {
    const first = sourceStay({
      status: 'Considering',
      timing: { arrival: '2030-04-10', departure: '2030-04-12' },
    });
    const second = sourceStay({
      id: 14,
      status: 'Considering',
      timing: { arrival: '2030-04-12', departure: '2030-04-16' },
    });
    const sources: ArrangementSources = { stays: [first, second], legs: new Map() };
    expect(arrangementVisitCoverage(sourceVisit(), sources, true)).toEqual({
      unknown: false,
      findings: [{ kind: 'missing', arrival: '2030-04-10', departure: '2030-04-16', stayIds: [] }],
    });
    expect(sources.stays).toEqual([first, second]);
  });
  it('retains checkout switches and reports actual arranged overlaps without counting ideas as coverage', () => {
    const first = sourceStay({
      status: 'Agreed',
      timing: { arrival: '2030-04-10', departure: '2030-04-14' },
    });
    const second = sourceStay({
      id: 14,
      status: 'Reserved',
      timing: { arrival: '2030-04-12', departure: '2030-04-16' },
    });
    const idea = sourceStay({
      id: 15,
      status: 'Considering',
      timing: { arrival: '2030-04-11', departure: '2030-04-15' },
    });
    expect(
      arrangementVisitCoverage(
        sourceVisit(),
        { stays: [first, second, idea], legs: new Map() },
        true
      )
    ).toEqual({
      unknown: false,
      findings: [
        { kind: 'overlap', arrival: '2030-04-12', departure: '2030-04-14', stayIds: [13, 14] },
      ],
    });
    expect(
      arrangementVisitCoverage(
        sourceVisit(),
        {
          stays: [
            sourceStay(),
            { ...second, timing: { arrival: '2030-04-13', departure: '2030-04-16' } },
          ],
          legs: new Map(),
        },
        true
      )
    ).toEqual({ unknown: false, findings: [] });
  });
  it('never exposes a gap action for unknown dates or incomplete source context', () => {
    expect(
      arrangementVisitCoverage(sourceVisit(), { stays: [sourceStay()], legs: new Map() }, false)
    ).toEqual({ unknown: true, findings: [] });
    expect(
      arrangementVisitCoverage(sourceVisit({ timing: {} }), { stays: [], legs: new Map() }, true)
    ).toEqual({ unknown: true, findings: [] });
    expect(
      arrangementVisitCoverage(
        sourceVisit(),
        { stays: [sourceStay({ timing: {} })], legs: new Map() },
        true
      )
    ).toEqual({ unknown: true, findings: [] });
  });
});
