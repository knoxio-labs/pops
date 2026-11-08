import { describe, expect, it } from 'vitest';

import { alternativeFindings } from './impact';
import { applyAlternative, initialAlternatives, previewVisits } from './model';

describe('alternative previews', () => {
  it('previews without changing working membership or any source facts', () => {
    const source = initialAlternatives('default');
    const snapshot = structuredClone(source);
    expect(previewVisits(source, 'section-minas').map((visit) => visit.id)).toEqual([
      'recife',
      'minas',
      'rio',
    ]);
    expect(alternativeFindings(source, 'section-minas')).toContainEqual({
      id: 'coast-stay',
      kind: 'purchase',
      title: 'Hotel da Praia',
      detail: 'Purchased · outside preview',
    });
    expect(source).toEqual(snapshot);
    const applied = applyAlternative(source, 'section-minas');
    expect(applied.workingId).toBe('section-minas');
    expect(applied.canvas).toBe(source.canvas);
    expect(
      alternativeFindings(applied, 'section-minas').some((finding) => finding.id === 'coast-stay')
    ).toBe(true);
  });

  it('rejects missing, empty, wrong-gap and unchanged choices', () => {
    const source = initialAlternatives('default');
    expect(applyAlternative(source, 'missing')).toBe(source);
    expect(applyAlternative(source, 'section-northeast')).toBe(source);
    source.canvas.sections.push(
      { id: 'empty', gapId: source.gapId, title: '', cards: [] },
      { id: 'wrong', gapId: 'other', title: '', cards: ['minas'] }
    );
    expect(applyAlternative(source, 'empty')).toBe(source);
    expect(applyAlternative(source, 'wrong')).toBe(source);
  });

  it('keeps broken references visible and refuses to apply them', () => {
    const source = initialAlternatives('missing-reference');
    expect(alternativeFindings(source, 'section-northeast')).toContainEqual({
      id: 'removed-visit',
      kind: 'reference',
      title: 'Visit unavailable',
      detail: '',
    });
    source.workingId = undefined;
    expect(applyAlternative(source, 'section-northeast')).toBe(source);
  });

  it('counts only uncovered checkout intervals and retains unknown date gaps without invented dates', () => {
    const source = initialAlternatives('default');
    expect(
      alternativeFindings(source, 'section-northeast')
        .filter((finding) => finding.kind === 'accommodation')
        .map((finding) => finding.detail)
    ).toEqual(['6 Jan → 10 Jan', '13 Jan → 4 Feb']);
    expect(
      alternativeFindings(source, 'section-es')
        .filter((finding) => finding.kind === 'accommodation')
        .map((finding) => finding.detail)
    ).toEqual(['']);
  });

  it('matches transport by both explicit endpoints and compares linked event dates', () => {
    const source = initialAlternatives('date-conflict');
    expect(
      alternativeFindings(source, 'section-minas').some(
        (finding) => finding.id === 'outside-festival'
      )
    ).toBe(true);
    source.canvas.transitLinks.flight = { from: 'recife', to: 'minas' };
    const gaps = alternativeFindings(source, 'section-minas').filter(
      (finding) => finding.kind === 'transport'
    );
    expect(gaps.map((finding) => finding.id)).toEqual(['transport-minas-rio']);
    source.canvas.transitLinks.flight = { from: 'minas', to: 'recife' };
    expect(
      alternativeFindings(source, 'section-minas').filter((finding) => finding.kind === 'transport')
    ).toHaveLength(2);
  });
});
