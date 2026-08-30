import { describe, expect, it } from 'vitest';

import { classifyAssignedEntity } from './assigned-entity';

import type { ProcessedTransaction } from '@pops/finance';

function row(entity: ProcessedTransaction['entity'] = { matchType: 'none' }): ProcessedTransaction {
  return {
    date: '2026-06-29',
    description: 'APPLE.COM/BILL',
    amount: -144.99,
    account: 'ANZ Credit Card',
    rawRow: '{}',
    checksum: 'apple-1',
    entity,
    status: 'matched',
  };
}

const LOADED = [{ id: 'ent-apple' }, { id: 'ent-paypal' }];

describe('classifyAssignedEntity', () => {
  it('calls a row with no entity unassigned', () => {
    expect(classifyAssignedEntity(row(), LOADED)).toBe('unassigned');
    expect(classifyAssignedEntity(row({ entityName: 'Apple', matchType: 'learned' }), LOADED)).toBe(
      'unassigned'
    );
  });

  it('resolves an id that is among the loaded options', () => {
    expect(
      classifyAssignedEntity(
        row({ entityId: 'ent-apple', entityName: 'Apple', matchType: 'learned' }),
        LOADED
      )
    ).toBe('resolved');
  });

  /** The production shape: a correction rule carrying an outbox placeholder. */
  it('calls a pending:contact placeholder never-created, even before options load', () => {
    const placeholder = row({
      entityId: 'pending:contact:4c42ebf6-f6b7-4ce5-91ab-70ac3645ecbd',
      entityName: 'Apple',
      matchType: 'learned',
    });

    expect(classifyAssignedEntity(placeholder, LOADED)).toBe('never-created');
    expect(classifyAssignedEntity(placeholder, undefined)).toBe('never-created');
  });

  /**
   * Only sound because `useEntities` loads the whole contact set (POPS-226).
   * While it was one capped page, absence was not evidence of anything and
   * this claim would have been the blank picker's overstatement in reverse.
   */
  it('reads absence from a loaded list as a genuinely missing contact', () => {
    const orphan = row({ entityId: 'ent-deleted', entityName: 'Gone Co', matchType: 'learned' });

    expect(classifyAssignedEntity(orphan, LOADED)).toBe('missing');
  });

  it('concludes nothing while the options are still loading', () => {
    expect(
      classifyAssignedEntity(
        row({ entityId: 'ent-apple', entityName: 'Apple', matchType: 'learned' }),
        undefined
      )
    ).toBe('loading');
  });

  /** A locally-created entity is merged into the options, so it resolves. */
  it('resolves a temp:entity id once it is in the options', () => {
    const tempId = 'temp:entity:00000000-0000-4000-8000-000000000000';
    expect(
      classifyAssignedEntity(row({ entityId: tempId, entityName: 'New Co', matchType: 'manual' }), [
        ...LOADED,
        { id: tempId },
      ])
    ).toBe('resolved');
  });
});
