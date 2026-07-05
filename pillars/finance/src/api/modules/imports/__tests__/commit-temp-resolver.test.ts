/**
 * Unit tests for the commit temp-id resolver and its persistable-id guard
 * (#3622 / CF016). These pin the fail-loud contract that keeps a
 * `temp:entity:{uuid}` placeholder — or any stray `temp:`-prefixed id — from
 * being silently written to `entity_id`: a missing mapping or a residual
 * placeholder must throw (rolling the commit back), while a resolvable temp id
 * and a plain contact id resolve/pass through untouched.
 */
import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../../shared/errors.js';
import {
  resolveChangeSetTempIds,
  resolveTagRuleChangeSetTempIds,
} from '../commit-temp-resolver.js';
import { assertPersistableEntityId, COMMIT_TEMP_ENTITY_PREFIX } from '../commit-validation.js';

import type { TagRuleChangeSet } from '../../../../contract/rest-tag-rules.js';
import type { CommitPayload } from '../types.js';

const TEMP_ID = `${COMMIT_TEMP_ENTITY_PREFIX}00000000-0000-0000-0000-000000000001`;
const REAL_ID = '550e8400-e29b-41d4-a716-446655440000';

function correctionChangeSet(entityId: string): CommitPayload['changeSets'][number] {
  return {
    ops: [
      { op: 'add', data: { descriptionPattern: 'ACME', matchType: 'exact', tags: [], entityId } },
    ],
  };
}

function tagRuleChangeSet(entityId: string): TagRuleChangeSet {
  return {
    ops: [
      {
        op: 'add',
        data: { descriptionPattern: 'ACME', matchType: 'exact', tags: ['coffee'], entityId },
      },
    ],
  };
}

function addOpEntityId(
  op: CommitPayload['changeSets'][number]['ops'][number]
): string | null | undefined {
  return op.op === 'add' ? op.data.entityId : undefined;
}

function caught(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error('expected the call to throw a ValidationError');
}

describe('assertPersistableEntityId', () => {
  it('accepts a real contact id', () => {
    expect(() => assertPersistableEntityId(REAL_ID, REAL_ID)).not.toThrow();
  });

  it('rejects an unresolved (null) id as a 400', () => {
    const error = caught(() => assertPersistableEntityId(TEMP_ID, null));
    expect(error.statusCode).toBe(400);
    expect(String(error.details)).toContain('no resolved contact');
  });

  it('rejects an undefined mapping result', () => {
    expect(() => assertPersistableEntityId(TEMP_ID, undefined)).toThrow(ValidationError);
  });

  it('rejects any residual temp:-prefixed id, not only temp:entity:', () => {
    const error = caught(() => assertPersistableEntityId('temp:contact:x', 'temp:contact:x'));
    expect(error.statusCode).toBe(400);
    expect(String(error.details)).toContain('placeholder');
  });
});

describe('resolveChangeSetTempIds', () => {
  it('resolves a mapped temp id to the real contact id', () => {
    const resolved = resolveChangeSetTempIds(
      correctionChangeSet(TEMP_ID),
      new Map([[TEMP_ID, REAL_ID]])
    );
    expect(addOpEntityId(resolved.ops[0]!)).toBe(REAL_ID);
  });

  it('leaves a plain contact id untouched', () => {
    const resolved = resolveChangeSetTempIds(correctionChangeSet(REAL_ID), new Map());
    expect(addOpEntityId(resolved.ops[0]!)).toBe(REAL_ID);
  });

  it('throws on a temp id with no mapping instead of persisting the placeholder', () => {
    const error = caught(() => resolveChangeSetTempIds(correctionChangeSet(TEMP_ID), new Map()));
    expect(error.statusCode).toBe(400);
    expect(String(error.details)).toContain('no resolved contact');
  });

  it('throws on a residual temp: id that is not a temp:entity reference', () => {
    const error = caught(() =>
      resolveChangeSetTempIds(correctionChangeSet('temp:contact:abc'), new Map())
    );
    expect(String(error.details)).toContain('placeholder');
  });
});

describe('resolveTagRuleChangeSetTempIds', () => {
  it('resolves a mapped temp id to the real contact id', () => {
    const resolved = resolveTagRuleChangeSetTempIds(
      tagRuleChangeSet(TEMP_ID),
      new Map([[TEMP_ID, REAL_ID]])
    );
    const op = resolved.ops[0]!;
    expect(op.op === 'add' ? op.data.entityId : undefined).toBe(REAL_ID);
  });

  it('throws on a temp id with no mapping (the 3-dead-tag_rules failure)', () => {
    expect(() => resolveTagRuleChangeSetTempIds(tagRuleChangeSet(TEMP_ID), new Map())).toThrow(
      ValidationError
    );
  });
});
