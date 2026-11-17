import { describe, expect, it } from 'vitest';

import { initialSelection, projectSelection } from '../grant-selection';
import { grant } from './grant-fixtures';

describe('complete grant selections', () => {
  it('retains unrelated permissions when adding a selectable value', () => {
    const current = grant();
    const projection = projectSelection(current, [
      ...initialSelection(current),
      'documents.upload',
    ]);
    expect(projection.capabilities).toEqual(['session.read', 'purchases.read', 'documents.upload']);
    expect(projection.added).toEqual(['documents.upload']);
    expect(projection.removed).toEqual([]);
  });
  it('permits an intentional empty explicit grant', () => {
    expect(projectSelection(grant(), []).capabilities).toEqual([]);
    expect(projectSelection(grant(), []).removed).toEqual(['session.read', 'purchases.read']);
  });
  it('makes an unchanged default selection an explicit complete replacement', () => {
    const current = grant({ mode: 'tracks-default', stored: [] });
    expect(projectSelection(current, initialSelection(current))).toMatchObject({
      changed: true,
      capabilities: current.effective,
    });
    expect(projectSelection(grant(), initialSelection(grant())).changed).toBe(false);
  });
  it('keeps unavailable stored values and blocks even attempts to filter them out', () => {
    const current = grant({ stored: ['session.read', 'future.example.read'] });
    expect(initialSelection(current)).toContain('future.example.read');
    expect(projectSelection(current, ['session.read']).unavailable).toEqual([
      'future.example.read',
    ]);
  });
  it('also blocks effective values unavailable under the returned catalogue', () => {
    const current = grant({ effective: ['future.example.read'] });
    expect(projectSelection(current, initialSelection(current)).unavailable).toEqual([
      'future.example.read',
    ]);
  });
  it('uses the supplied catalogue rather than guessing from a capability name', () => {
    const current = grant({ selectable: ['session.read'], stored: ['purchases.read'] });
    expect(projectSelection(current, ['purchases.read']).unavailable).toEqual(['purchases.read']);
  });
});
