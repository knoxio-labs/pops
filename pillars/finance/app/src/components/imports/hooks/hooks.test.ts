import { describe, expect, it } from 'vitest';

import { deriveCanApply } from './deriveCanApply';
import {
  findLocalOpProblem,
  localOpsToChangeSet,
  localOpToServerOp,
  newClientId,
  serverOpToLocalOp,
} from './useLocalOps';

import type { LocalOp, ServerChangeSetOp } from '../correction-proposal-shared';
import type { CorrectionRule } from '../RulePicker';
import type {
  UseApplyRejectMutationsOptions,
  UseApplyRejectMutationsReturn,
} from './applyRejectTypes';
import type { UsePreviewEffectsOptions } from './usePreviewEffects';

// ---------------------------------------------------------------------------
// newClientId
// ---------------------------------------------------------------------------

describe('newClientId', () => {
  it('returns a string starting with the given prefix', () => {
    expect(newClientId('add')).toMatch(/^add-/);
    expect(newClientId('edit')).toMatch(/^edit-/);
    expect(newClientId('disable')).toMatch(/^disable-/);
    expect(newClientId('remove')).toMatch(/^remove-/);
  });

  it('returns unique ids on successive calls', () => {
    const a = newClientId('add');
    const b = newClientId('add');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// serverOpToLocalOp
// ---------------------------------------------------------------------------

const fakeRule: CorrectionRule = {
  id: 'rule-1',
  descriptionPattern: 'SOME PATTERN',
  accountId: null,
  matchType: 'contains',
  entityId: 'ent-1',
  entityName: 'Entity One',
  location: null,
  tags: ['tag-a'],
  transactionType: 'purchase',
  isActive: true,
  priority: 0,
  confidence: 0.9,
  timesApplied: 0,
  createdAt: '2025-01-01',
  lastUsedAt: null,
};

const targetRules: Record<string, CorrectionRule> = { 'rule-1': fakeRule };

describe('serverOpToLocalOp', () => {
  it('converts an add op', () => {
    const serverOp: ServerChangeSetOp = {
      op: 'add',
      data: { descriptionPattern: 'TEST', matchType: 'exact', tags: [] },
    };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('add');
    expect(local.dirty).toBe(false);
    expect(local.clientId).toMatch(/^add-/);
    if (local.kind === 'add') {
      expect(local.data.descriptionPattern).toBe('TEST');
    }
  });

  it('converts an edit op and hydrates targetRule', () => {
    const serverOp: ServerChangeSetOp = {
      op: 'edit',
      id: 'rule-1',
      data: { tags: ['new-tag'] },
    };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('edit');
    if (local.kind === 'edit') {
      expect(local.targetRuleId).toBe('rule-1');
      expect(local.targetRule).toEqual(fakeRule);
      expect(local.data.tags).toEqual(['new-tag']);
    }
  });

  it('converts a disable op', () => {
    const serverOp: ServerChangeSetOp = { op: 'disable', id: 'rule-1' };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('disable');
    if (local.kind === 'disable') {
      expect(local.targetRuleId).toBe('rule-1');
      expect(local.targetRule).toEqual(fakeRule);
    }
  });

  it('converts a remove op', () => {
    const serverOp: ServerChangeSetOp = { op: 'remove', id: 'rule-1' };
    const local = serverOpToLocalOp(serverOp, targetRules);
    expect(local.kind).toBe('remove');
    if (local.kind === 'remove') {
      expect(local.targetRuleId).toBe('rule-1');
      expect(local.targetRule).toEqual(fakeRule);
    }
  });

  it('sets targetRule to null when rule is missing from lookup', () => {
    const serverOp: ServerChangeSetOp = { op: 'edit', id: 'missing', data: {} };
    const local = serverOpToLocalOp(serverOp, {});
    if (local.kind === 'edit') {
      expect(local.targetRule).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// localOpToServerOp
// ---------------------------------------------------------------------------

describe('localOpToServerOp', () => {
  it('converts add op', () => {
    const local: LocalOp = {
      kind: 'add',
      clientId: 'add-1',
      data: { descriptionPattern: 'X', matchType: 'contains', tags: [] },
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'add', data: local.data });
  });

  it('converts edit op', () => {
    const local: LocalOp = {
      kind: 'edit',
      clientId: 'edit-1',
      targetRuleId: 'rule-1',
      targetRule: fakeRule,
      data: { tags: ['a'] },
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'edit', id: 'rule-1', data: { tags: ['a'] } });
  });

  it('converts disable op', () => {
    const local: LocalOp = {
      kind: 'disable',
      clientId: 'disable-1',
      targetRuleId: 'rule-1',
      targetRule: fakeRule,
      rationale: '',
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'disable', id: 'rule-1' });
  });

  it('converts remove op', () => {
    const local: LocalOp = {
      kind: 'remove',
      clientId: 'remove-1',
      targetRuleId: 'rule-1',
      targetRule: fakeRule,
      rationale: '',
      dirty: false,
    };
    expect(localOpToServerOp(local)).toEqual({ op: 'remove', id: 'rule-1' });
  });
});

// ---------------------------------------------------------------------------
// localOpsToChangeSet
// ---------------------------------------------------------------------------

describe('localOpsToChangeSet', () => {
  it('returns null for empty ops', () => {
    expect(localOpsToChangeSet([])).toBeNull();
  });

  it('builds a change set from ops', () => {
    const addOp: Extract<LocalOp, { kind: 'add' }> = {
      kind: 'add',
      clientId: 'add-1',
      data: { descriptionPattern: 'X', matchType: 'contains', tags: [] },
      dirty: false,
    };
    const ops: LocalOp[] = [addOp];
    const cs = localOpsToChangeSet(ops);
    expect(cs).not.toBeNull();
    expect(cs!.source).toBe('correction-proposal-dialog');
    expect(cs!.ops).toHaveLength(1);
    expect(cs!.ops[0]).toEqual({ op: 'add', data: addOp.data });
  });

  it('accepts custom source and reason', () => {
    const ops: LocalOp[] = [
      {
        kind: 'add',
        clientId: 'add-2',
        data: { descriptionPattern: 'Y', matchType: 'exact', tags: [] },
        dirty: false,
      },
    ];
    const cs = localOpsToChangeSet(ops, { source: 'test', reason: 'test-reason' });
    expect(cs!.source).toBe('test');
    expect(cs!.reason).toBe('test-reason');
  });
});

// ---------------------------------------------------------------------------
// usePreviewEffects — interface contract
// ---------------------------------------------------------------------------

describe('usePreviewEffects — interface contract', () => {
  it('UsePreviewEffectsOptions requires the expected shape', () => {
    const opts: UsePreviewEffectsOptions = {
      open: true,
      localOps: [],
      selectedOp: null,
      previewTransactions: [],
      pendingChangeSets: [],
    };
    expect(opts.open).toBe(true);
    expect(opts.localOps).toEqual([]);
    expect(opts.selectedOp).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useApplyRejectMutations — interface contract + canApply derivation
// ---------------------------------------------------------------------------

describe('useApplyRejectMutations — interface contract', () => {
  it('UseApplyRejectMutationsOptions requires the expected fields', () => {
    const opts: UseApplyRejectMutationsOptions = {
      signal: null,
      localOps: [],
      combinedPreview: null,
      combinedPreviewError: null,
      previewTransactions: [],
      isFetching: false,
      previewMutationPending: false,
      hasDirty: false,
      onClose: () => {},
      setLocalOps: () => {},
      setSelectedClientId: () => {},
      setRationale: () => {},
      lastCombinedStructuralSigRef: { current: null },
      selectedOpPreviewKeyRef: { current: null },
    };
    expect(opts.signal).toBeNull();
  });

  it('UseApplyRejectMutationsReturn exposes the expected keys', () => {
    const keys: Array<keyof UseApplyRejectMutationsReturn> = [
      'rejectMode',
      'setRejectMode',
      'rejectFeedback',
      'setRejectFeedback',
      'aiInstruction',
      'setAiInstruction',
      'aiMessages',
      'setAiMessages',
      'aiBusy',
      'isBusy',
      'canApply',
      'handleApprove',
      'handleConfirmReject',
      'handleAiSubmit',
      'handleApplyLocal',
      'rejectMutationPending',
      'resetMutationState',
    ];
    expect(keys).toHaveLength(17);
  });
});

describe('deriveCanApply', () => {
  const ready = { isBusy: false, opsCount: 1, hasDirty: false, previewError: null };

  it('allows applying when the editor is idle with clean ops and a good preview', () => {
    expect(deriveCanApply(ready)).toBe(true);
  });

  it('refuses while the editor is busy', () => {
    expect(deriveCanApply({ ...ready, isBusy: true })).toBe(false);
  });

  it('refuses with no operations to apply', () => {
    expect(deriveCanApply({ ...ready, opsCount: 0 })).toBe(false);
  });

  it('refuses while an edit has not been previewed', () => {
    expect(deriveCanApply({ ...ready, hasDirty: true })).toBe(false);
  });

  it('refuses when the preview failed', () => {
    expect(deriveCanApply({ ...ready, previewError: 'fail' })).toBe(false);
  });

  // POPS-3358. A live Up draft has no process session: its rows arrive
  // pre-mapped and skip the Process step. The gate that required one made
  // Apply impossible to enable for every live import, which is how it shipped.
  it('allows applying in an import that has no process session', () => {
    expect(deriveCanApply(ready)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findLocalOpProblem
// ---------------------------------------------------------------------------

function addOp(descriptionPattern: string): LocalOp {
  return {
    kind: 'add',
    clientId: 'add-1',
    data: { descriptionPattern, matchType: 'contains', tags: [] },
    dirty: true,
  };
}

function editOp(data: Extract<LocalOp, { kind: 'edit' }>['data']): LocalOp {
  return {
    kind: 'edit',
    clientId: 'edit-1',
    targetRuleId: 'rule-1',
    targetRule: fakeRule,
    data,
    dirty: true,
  };
}

describe('findLocalOpProblem', () => {
  it('passes an empty op list', () => {
    expect(findLocalOpProblem([])).toBeNull();
  });

  it('rejects an add op with no pattern', () => {
    expect(findLocalOpProblem([addOp('')])).toMatch(/description pattern/i);
  });

  it('rejects an add op whose pattern is only whitespace', () => {
    expect(findLocalOpProblem([addOp('   ')])).toMatch(/description pattern/i);
  });

  it('accepts an add op with a pattern', () => {
    expect(findLocalOpProblem([addOp('WOOLWORTHS')])).toBeNull();
  });

  it('rejects an edit op that empties the pattern', () => {
    expect(findLocalOpProblem([editOp({ descriptionPattern: '' })])).toMatch(/cannot be emptied/i);
  });

  it('accepts an edit op that leaves the pattern alone', () => {
    expect(findLocalOpProblem([editOp({ location: 'Sydney' })])).toBeNull();
  });

  it('accepts an edit op that rewrites the pattern', () => {
    expect(findLocalOpProblem([editOp({ descriptionPattern: 'XX7373' })])).toBeNull();
  });

  it('reports the first problem across a mixed list', () => {
    expect(findLocalOpProblem([addOp('OK'), editOp({ descriptionPattern: ' ' })])).toMatch(
      /cannot be emptied/i
    );
  });

  it('ignores disable and remove ops', () => {
    const disable: LocalOp = {
      kind: 'disable',
      clientId: 'disable-1',
      targetRuleId: 'rule-1',
      targetRule: fakeRule,
      rationale: '',
      dirty: true,
    };
    expect(findLocalOpProblem([disable])).toBeNull();
  });
});
