import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { elementAt } from '../../test-utils';
import {
  CorrectionProposalDialog,
  type LocalOp,
  normalizeDescription,
  PREVIEW_CHANGESET_MAX_TRANSACTIONS,
  scopePreviewTransactions,
  serverOpToLocalOp,
  transactionMatchesSignal,
} from './CorrectionProposalDialog';

import type { CorrectionRule } from './RulePicker';

type ProposeData = {
  changeSet: {
    source?: string;
    ops: Array<Record<string, unknown>>;
  };
  rationale: string;
  preview: { counts: Record<string, number>; affected: unknown[] };
} | null;

let mockProposeData: ProposeData = null;
const mockPreviewMutateAsync = vi.fn();
const mockRejectMutate = vi.fn();
const mockListQuery = vi.fn();
const mockReviseMutateAsync = vi.fn();
const mockAddPendingChangeSet = vi.fn();
const mockAddPendingEntity = vi.fn();

const { mockDescriptionsForPreview } = vi.hoisted(() => ({
  mockDescriptionsForPreview: vi.fn(),
}));

// The generated SDK fns delegate to the per-operation mock vars and return
// Hey API `{ data }` envelopes so the real `unwrap` resolves them.
vi.mock('../../finance-api/index.js', () => ({
  transactionsDescriptionsForPreview: (...args: unknown[]) => mockDescriptionsForPreview(...args),
  correctionsProposeChangeSet: () => Promise.resolve({ data: mockProposeData }),
  correctionsPreviewChangeSet: async (arg: { body: unknown }) => ({
    data: await mockPreviewMutateAsync(arg.body),
  }),
  correctionsReviseChangeSet: async (arg: { body: unknown }) => ({
    data: await mockReviseMutateAsync(arg.body),
  }),
  correctionsRejectChangeSet: async (arg: { body: unknown }) => {
    mockRejectMutate(arg.body);
    return { data: { message: 'rejected' } };
  },
  correctionsList: (arg: unknown) => Promise.resolve({ data: mockListQuery(arg).data }),
  correctionsListMerged: (arg: { body: unknown }) =>
    Promise.resolve({ data: mockListQuery(arg.body).data }),
}));

vi.mock('../../contacts-api/index.js', () => ({
  entitiesList: () =>
    Promise.resolve({
      data: {
        data: [
          { id: 'ent-woolies', name: 'Woolworths' },
          { id: 'ent-coles', name: 'Coles' },
        ].map((e) => ({
          ...e,
          aliases: [],
          defaultTags: [],
          type: 'company',
          lastEditedTime: '2026-01-01T00:00:00.000Z',
        })),
        pagination: { hasMore: false, limit: 50, offset: 0, total: 2 },
      },
    }),
}));

vi.mock('../../store/importStore', () => {
  // Stable references: zustand returns the same slice until it mutates, and the
  // combined-preview effect keys on `pendingChangeSets` identity — a fresh array
  // per render would re-run (and cancel) the in-flight preview every render.
  // `pendingEntities` is stable for the same reason: the entity picker merges it
  // with the fetched contacts inside a `useMemo` keyed on its identity.
  const pendingChangeSets: unknown[] = [];
  const pendingEntities: unknown[] = [];
  return {
    useImportStore: (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        addPendingChangeSet: mockAddPendingChangeSet,
        pendingChangeSets,
        pendingEntities,
        addPendingEntity: mockAddPendingEntity,
      }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('normalizeDescription', () => {
  it('uppercases, strips digits, and collapses whitespace', () => {
    expect(normalizeDescription('Woolworths 1234 Sydney')).toBe('WOOLWORTHS SYDNEY');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeDescription('  netflix  ')).toBe('NETFLIX');
  });

  it('collapses multiple internal spaces to single', () => {
    expect(normalizeDescription('FOO    BAR')).toBe('FOO BAR');
  });

  it('strips all digits, not just standalone runs', () => {
    expect(normalizeDescription('TXN42ABC99')).toBe('TXNABC');
  });
});

describe('transactionMatchesSignal', () => {
  describe('contains', () => {
    it('matches when normalized description contains normalized pattern', () => {
      expect(
        transactionMatchesSignal('WOOLWORTHS 1234 ERSKINEVILLE', 'WOOLWORTHS', 'contains')
      ).toBe(true);
    });

    it('ignores digits in both description and pattern', () => {
      expect(transactionMatchesSignal('STORE 42 SYDNEY', 'STORE 99', 'contains')).toBe(true);
    });

    it('is case-insensitive via normalization', () => {
      expect(transactionMatchesSignal('netflix australia', 'NETFLIX', 'contains')).toBe(true);
    });

    it('rejects when pattern substring is absent', () => {
      expect(transactionMatchesSignal('COLES 1234 NEWTOWN', 'WOOLWORTHS', 'contains')).toBe(false);
    });

    it('rejects an empty pattern so we do not match everything', () => {
      expect(transactionMatchesSignal('ANYTHING', '', 'contains')).toBe(false);
      expect(transactionMatchesSignal('ANYTHING', '   ', 'contains')).toBe(false);
    });
  });

  describe('exact', () => {
    it('matches when normalized description equals normalized pattern', () => {
      expect(transactionMatchesSignal('NETFLIX 42', 'NETFLIX', 'exact')).toBe(true);
    });

    it('rejects when description has extra words', () => {
      expect(transactionMatchesSignal('NETFLIX AUSTRALIA PTY LTD', 'NETFLIX', 'exact')).toBe(false);
    });
  });

  describe('regex', () => {
    // These tests mirror the server's shared `patternMatchesDescription`:
    // `new RegExp(pattern, 'i').test(rawDescription)` — a regex is tested
    // against the description exactly as it arrived, undigested (POPS-2640).
    // The `i` flag is kept because a rule editor's authors expect it.
    it('matches case-insensitively against the raw description', () => {
      expect(transactionMatchesSignal('PayID from John', 'PAYID', 'regex')).toBe(true);
      expect(transactionMatchesSignal('PayID from John', 'payid', 'regex')).toBe(true);
    });

    it('sees the digits, so \\d+ matches digits in the input', () => {
      expect(transactionMatchesSignal('TXN42', 'TXN\\d+', 'regex')).toBe(true);
      // The digit is really there, so a pattern written for the digit-stripped
      // form no longer matches — the same verdict the server now gives.
      expect(transactionMatchesSignal('TXN42', '^TXN\\s*$', 'regex')).toBe(false);
    });

    it('does not fold diacritics the way contains does', () => {
      expect(transactionMatchesSignal('CAFÉ MOZART', 'CAFE', 'regex')).toBe(false);
      expect(transactionMatchesSignal('CAFÉ MOZART', 'CAFE', 'contains')).toBe(true);
    });

    it('honours anchors in the pattern', () => {
      expect(transactionMatchesSignal('NETFLIX', '^NETFLIX$', 'regex')).toBe(true);
      expect(transactionMatchesSignal('NETFLIX AUSTRALIA', '^NETFLIX$', 'regex')).toBe(false);
    });

    it('returns false (not throws) for an invalid regex pattern', () => {
      expect(transactionMatchesSignal('anything', '[unclosed', 'regex')).toBe(false);
    });

    it('returns false for an empty regex pattern', () => {
      expect(transactionMatchesSignal('anything', '', 'regex')).toBe(false);
    });
  });
});

function makeRule(overrides: Partial<CorrectionRule> = {}): CorrectionRule {
  return {
    id: 'rule-1',
    descriptionPattern: 'WOOLWORTHS',
    matchType: 'contains',
    entityId: null,
    entityName: 'Woolworths',
    location: null,
    tags: [],
    transactionType: null,
    isActive: true,
    priority: 0,
    confidence: 0.95,
    timesApplied: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: null,
    ...overrides,
  };
}

describe('serverOpToLocalOp', () => {
  it("maps 'add' op without consulting targetRules", () => {
    const local = serverOpToLocalOp(
      {
        op: 'add',
        data: {
          descriptionPattern: 'NETFLIX',
          matchType: 'contains',
          entityName: 'Netflix',
          tags: [],
        },
      },
      {}
    );
    expect(local.kind).toBe('add');
    if (local.kind !== 'add') throw new Error('kind narrow');
    expect(local.data.descriptionPattern).toBe('NETFLIX');
    expect(local.dirty).toBe(false);
  });

  it("hydrates targetRule on 'edit' from the targetRules map", () => {
    const rule = makeRule({ id: 'rule-42' });
    const local = serverOpToLocalOp(
      { op: 'edit', id: 'rule-42', data: { entityName: 'Woolies' } },
      { 'rule-42': rule }
    );
    expect(local.kind).toBe('edit');
    if (local.kind !== 'edit') throw new Error('kind narrow');
    expect(local.targetRuleId).toBe('rule-42');
    expect(local.targetRule).toBe(rule);
  });

  it("leaves targetRule as null when hydration misses on 'disable'", () => {
    const local = serverOpToLocalOp({ op: 'disable', id: 'orphan' }, {});
    expect(local.kind).toBe('disable');
    if (local.kind !== 'disable') throw new Error('kind narrow');
    expect(local.targetRuleId).toBe('orphan');
    expect(local.targetRule).toBeNull();
  });

  it("hydrates targetRule on 'remove' when present in the map", () => {
    const rule = makeRule({ id: 'rule-99' });
    const local = serverOpToLocalOp(
      { op: 'remove', id: 'rule-99' },
      { 'rule-99': rule, other: makeRule({ id: 'other' }) }
    );
    expect(local.kind).toBe('remove');
    if (local.kind !== 'remove') throw new Error('kind narrow');
    expect(local.targetRule).toBe(rule);
  });
});

function addOp(pattern: string, matchType: 'exact' | 'contains' | 'regex' = 'contains'): LocalOp {
  return {
    kind: 'add',
    clientId: `add-${pattern}`,
    data: { descriptionPattern: pattern, matchType, entityName: 'E', tags: [] },
    dirty: false,
  };
}

function editOp(rule: CorrectionRule | null): LocalOp {
  return {
    kind: 'edit',
    clientId: `edit-${rule?.id ?? 'orphan'}`,
    targetRuleId: rule?.id ?? 'orphan',
    targetRule: rule,
    data: { entityName: 'Renamed' },
    dirty: false,
  };
}

describe('scopePreviewTransactions', () => {
  it("filters transactions to only those matching at least one add op's signal", () => {
    const txns = [
      { checksum: '1', description: 'WOOLWORTHS 1234 SYD' },
      { checksum: '2', description: 'COLES 9999 NEW' },
      { checksum: '3', description: 'NETFLIX 1X' },
    ];
    const { txns: scoped, truncated } = scopePreviewTransactions(
      [addOp('WOOLWORTHS'), addOp('NETFLIX')],
      txns
    );
    expect(scoped.map((t) => t.checksum)).toEqual(['1', '3']);
    expect(truncated).toBe(false);
  });

  it("uses a hydrated edit op's targetRule pattern for scoping", () => {
    const rule = makeRule({ id: 'r1', descriptionPattern: 'COLES', matchType: 'contains' });
    const txns = [
      { checksum: '1', description: 'WOOLWORTHS 1' },
      { checksum: '2', description: 'COLES 5 NEW' },
    ];
    const { txns: scoped } = scopePreviewTransactions([editOp(rule)], txns);
    expect(scoped.map((t) => t.checksum)).toEqual(['2']);
  });

  it('falls back to the full preview list when any non-add op lacks a hydrated targetRule', () => {
    const txns = [
      { checksum: '1', description: 'WOOLWORTHS 1' },
      { checksum: '2', description: 'COLES 5' },
    ];
    // edit op without hydrated targetRule (null) — scope must not guess.
    const { txns: scoped, truncated } = scopePreviewTransactions([editOp(null)], txns);
    expect(scoped).toHaveLength(2);
    expect(truncated).toBe(false);
  });

  it('caps the scoped list at PREVIEW_CHANGESET_MAX_TRANSACTIONS and reports truncated=true', () => {
    const total = PREVIEW_CHANGESET_MAX_TRANSACTIONS + 50;
    const txns = Array.from({ length: total }, (_, i) => ({
      checksum: String(i),
      description: `WOOLWORTHS ${i}`,
    }));
    const { txns: scoped, truncated } = scopePreviewTransactions([addOp('WOOLWORTHS')], txns);
    expect(scoped).toHaveLength(PREVIEW_CHANGESET_MAX_TRANSACTIONS);
    expect(truncated).toBe(true);
  });

  it('does not report truncated when scoped length exactly equals the cap', () => {
    const txns = Array.from({ length: PREVIEW_CHANGESET_MAX_TRANSACTIONS }, (_, i) => ({
      checksum: String(i),
      description: `WOOLWORTHS ${i}`,
    }));
    const { scoped, truncated } = (() => {
      const r = scopePreviewTransactions([addOp('WOOLWORTHS')], txns);
      return { scoped: r.txns, truncated: r.truncated };
    })();
    expect(scoped).toHaveLength(PREVIEW_CHANGESET_MAX_TRANSACTIONS);
    expect(truncated).toBe(false);
  });
});

const EMPTY_SUMMARY = {
  total: 0,
  newMatches: 0,
  removedMatches: 0,
  statusChanges: 0,
  netMatchedDelta: 0,
};

const SIGNAL = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains' as const,
  entityId: null,
  entityName: 'Woolworths',
  location: null,
  tags: [],
};

const TRIGGERING_TRANSACTION = {
  description: 'WOOLWORTHS 1234 SYDNEY',
  amount: -42.5,
  date: '2026-01-15',
  account: 'Amex',
  location: null,
  previousEntityName: null,
  previousTransactionType: null,
};

function seedTwoAddOps() {
  mockProposeData = {
    changeSet: {
      source: 'test',
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'WOOLWORTHS',
            matchType: 'contains',
            entityName: 'Woolworths',
            tags: [],
          },
        },
        {
          op: 'add',
          data: {
            descriptionPattern: 'COLES',
            matchType: 'contains',
            entityName: 'Coles',
            tags: [],
          },
        },
      ],
    },
    rationale: 'Test proposal',
    preview: {
      counts: {
        affected: 0,
        entityChanges: 0,
        locationChanges: 0,
        tagChanges: 0,
        typeChanges: 0,
      },
      affected: [],
    },
  };
}

function renderDialog(overrides: Partial<Parameters<typeof CorrectionProposalDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    sessionId: '11111111-1111-1111-1111-111111111111',
    signal: SIGNAL,
    triggeringTransaction: TRIGGERING_TRANSACTION,
    previewTransactions: [
      { checksum: 'a', description: 'WOOLWORTHS 1234 SYD' },
      { checksum: 'b', description: 'COLES 9999 NEW' },
    ],
    onApproved: vi.fn(),
    ...overrides,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <CorrectionProposalDialog {...props} />
    </QueryClientProvider>
  );
  const utils = render(tree);
  return { ...utils, props };
}

beforeEach(() => {
  mockProposeData = null;
  mockDescriptionsForPreview.mockReset();
  mockDescriptionsForPreview.mockResolvedValue({
    data: { data: [], total: 0, truncated: false },
    error: undefined,
  });
  mockPreviewMutateAsync.mockReset();
  mockPreviewMutateAsync.mockResolvedValue({ diffs: [], summary: EMPTY_SUMMARY });
  mockAddPendingChangeSet.mockReset();
  mockRejectMutate.mockReset();
  mockListQuery.mockReset();
  mockReviseMutateAsync.mockReset();
  mockReviseMutateAsync.mockResolvedValue({
    changeSet: {
      source: 'ai-helper',
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: 'TRANSFER',
            matchType: 'contains',
            entityName: 'Transfer',
            tags: [],
          },
        },
      ],
    },
    rationale: 'Replaced with a transfer rule per user request.',
  });
  mockListQuery.mockReturnValue({
    data: { data: [], pagination: {} },
    isLoading: false,
    isError: false,
  });
});

describe('CorrectionProposalDialog', () => {
  it('renders both ops from the initial proposal in the operations list', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/WOOLWORTHS → Woolworths/)).toBeInTheDocument();
    expect(screen.getByText(/COLES → Coles/)).toBeInTheDocument();
  });

  it('runs combined preview against the proposed ChangeSet on open', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });
    // The first call is the auto combined preview triggered by seeding.
    const firstCall = mockPreviewMutateAsync.mock.calls[0]?.[0] as {
      changeSet: { ops: unknown[] };
      transactions: unknown[];
    };
    expect(firstCall.changeSet.ops).toHaveLength(2);
  });

  it('deleting an op removes it from the list and shifts selection', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByLabelText('Delete operation');
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(elementAt(deleteButtons, 0));

    await waitFor(() => {
      expect(screen.getByText(/Operations \(1\)/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/WOOLWORTHS → Woolworths/)).not.toBeInTheDocument();
    expect(screen.getByText(/COLES → Coles/)).toBeInTheDocument();
  });

  it('editing a rule field auto-reruns preview and re-enables Apply', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());

    const callsBefore = mockPreviewMutateAsync.mock.calls.length;
    const patternInput = screen.getByDisplayValue('WOOLWORTHS') as HTMLInputElement;
    fireEvent.change(patternInput, { target: { value: 'WOOLWORTHS METRO' } });

    // Preview should auto-rerun with the new content sig.
    await waitFor(() => {
      expect(mockPreviewMutateAsync.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    // After rerun completes, dirty flag clears and Apply re-enables.
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
    expect(screen.queryByText(/Preview stale/i)).not.toBeInTheDocument();
  });

  it('keeps focus in the pattern field while the live preview reruns per keystroke (#3593)', async () => {
    // A never-resolving preview mimics a slow backend: the impact preview is
    // still in flight while the user keeps typing. The regression was that the
    // in-flight preview flag was folded into the rule editor's `disabled` prop,
    // so every keystroke disabled the focused input — the browser then blurred
    // it, forcing a re-click before each character.
    mockPreviewMutateAsync.mockReturnValue(new Promise<never>(() => undefined));
    seedTwoAddOps();
    renderDialog();

    const input = (await screen.findByDisplayValue('WOOLWORTHS')) as HTMLInputElement;

    // Precondition: the live preview must actually be in flight before we type,
    // otherwise a passing test would not exercise the disable-on-preview path
    // at all (false green). The seeded ops are clean and the session is set, so
    // the only thing blocking Apply here is the pending preview — asserting
    // Apply is disabled is a deterministic proxy for `previewMutationPending`.
    await waitFor(() => expect(mockPreviewMutateAsync).toHaveBeenCalled());
    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).toBeDisabled());

    // With that preview in flight, the editor must stay editable (the bug was
    // that the in-flight flag disabled the focused input, blurring it).
    expect(input).toBeEnabled();
    input.focus();
    expect(input).toHaveFocus();

    const user = userEvent.setup();
    await user.type(input, ' METRO');

    // Same DOM node (no remount / no re-created editor), still focused, and
    // every character landed — proving onChange fired per keystroke while the
    // preview remained pending.
    const after = screen.getByDisplayValue('WOOLWORTHS METRO');
    expect(after).toBe(input);
    expect(after).toHaveFocus();
    expect(after).toBeEnabled();
  });

  it('changing transaction type select auto-reruns preview and re-enables Apply', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument());
    await waitFor(() => expect(mockPreviewMutateAsync).toHaveBeenCalled());

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());

    const callsBefore = mockPreviewMutateAsync.mock.calls.length;
    // Select by option value rather than label — avoids brittle text matching
    const txnSelect = screen
      .getAllByRole('combobox')
      .find(
        (el) =>
          el.querySelector?.('option[value="purchase"]') ??
          Array.from((el as HTMLSelectElement).options ?? []).some((o) => o.value === 'purchase')
      ) as HTMLSelectElement;
    expect(txnSelect).toBeDefined();
    fireEvent.change(txnSelect, { target: { value: 'purchase' } });

    // Immediately after the edit the preview is stale and Apply is blocked
    expect(applyBtn).toBeDisabled();

    await waitFor(() => {
      expect(mockPreviewMutateAsync.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
    expect(screen.queryByText(/Preview stale/i)).not.toBeInTheDocument();
  });

  it('applies the entity picked in the detail editor as an id/name pair', async () => {
    // The editor used to expose `entityName` as free text while `entityId` — the
    // field that actually assigns the merchant — stayed untouched, so a rename
    // produced a rule that read "Coles" and applied Woolworths (or nothing).
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument());
    await waitFor(() => expect(mockPreviewMutateAsync).toHaveBeenCalled());

    const user = userEvent.setup();
    const entityPicker = screen.getByRole('combobox', { name: 'Entity' });
    expect(entityPicker).toHaveTextContent('Woolworths');
    await user.click(entityPicker);
    await user.click(within(screen.getByRole('listbox')).getByText('Coles'));

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
    fireEvent.click(applyBtn);

    const call = mockAddPendingChangeSet.mock.calls[0]?.[0] as {
      changeSet: { ops: Array<{ data: { entityId?: string; entityName?: string } }> };
    };
    expect(call.changeSet.ops[0]?.data).toMatchObject({
      entityId: 'ent-coles',
      entityName: 'Coles',
    });
  });

  it("adds a new 'add' op via the Add operation menu", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add operation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Add new rule$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Operations \(3\)/)).toBeInTheDocument();
    });
  });

  it('stores ChangeSet locally via addPendingChangeSet on Apply', async () => {
    seedTwoAddOps();
    const { props } = renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());

    fireEvent.click(applyBtn);

    expect(mockAddPendingChangeSet).toHaveBeenCalledTimes(1);
    const call = mockAddPendingChangeSet.mock.calls[0]?.[0] as {
      changeSet: { ops: unknown[] };
      source: string;
    };
    expect(call.changeSet.ops).toHaveLength(2);
    expect(call.source).toBe('correction-proposal');
    expect(props.onApproved).toHaveBeenCalledWith(
      expect.objectContaining({ ops: expect.any(Array) })
    );
  });

  it('reject flow requires feedback and calls rejectChangeSet', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reject with feedback/i }));

    // The dedicated confirm button lives in the reject panel.
    const confirmBtn = screen.getByRole('button', { name: /Confirm reject/i });
    expect(confirmBtn).toBeDisabled();

    const feedbackBox = screen.getByPlaceholderText(/Why is this proposal wrong/i);
    fireEvent.change(feedbackBox, { target: { value: 'Too broad, should be exact' } });

    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockRejectMutate).toHaveBeenCalledTimes(1));
    const call = mockRejectMutate.mock.calls[0]?.[0] as {
      feedback: string;
      changeSet: { ops: unknown[] };
    };
    expect(call.feedback).toBe('Too broad, should be exact');
    expect(call.changeSet.ops).toHaveLength(2);
  });

  it('AI helper submit calls reviseChangeSet and replaces ops with the response', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/split location into its own rule/i);
    fireEvent.change(input, { target: { value: 'replace with a transfer rule' } });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(screen.getByText('replace with a transfer rule')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockReviseMutateAsync).toHaveBeenCalledTimes(1);
    });
    const call = mockReviseMutateAsync.mock.calls[0]?.[0] as {
      instruction: string;
      currentChangeSet: { ops: unknown[] };
      signal: unknown;
      triggeringTransactions: unknown[];
    };
    expect(call.instruction).toBe('replace with a transfer rule');
    expect(call.currentChangeSet.ops).toHaveLength(2);
    expect(call.signal).toBeTruthy();
    expect(Array.isArray(call.triggeringTransactions)).toBe(true);

    // The revised ops replace the local list rather than appending.
    await waitFor(() => {
      expect(screen.getByText(/Operations \(1\)/)).toBeInTheDocument();
    });
    expect(screen.getByText(/TRANSFER → Transfer/)).toBeInTheDocument();

    // The rationale appears both in the transcript and in the context panel
    // rationale row, so assert at least one match exists.
    expect(
      screen.getAllByText(/Replaced with a transfer rule per user request/).length
    ).toBeGreaterThan(0);
  });

  it('AI helper surfaces an error message when reviseChangeSet rejects', async () => {
    seedTwoAddOps();
    mockReviseMutateAsync.mockRejectedValueOnce(new Error('AI down'));
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/split location into its own rule/i);
    fireEvent.change(input, { target: { value: 'broken request' } });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error: AI down/i)).toBeInTheDocument();
    });
    // Original ops remain untouched on failure.
    expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
  });

  it("renders the triggering transaction's raw description, amount, date and account", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-description')).toHaveTextContent(
      'WOOLWORTHS 1234 SYDNEY'
    );
    // Currency formatting is locale-dependent in CI; assert it contains the
    // dollar amount and currency symbol rather than the exact glyph.
    expect(screen.getByTestId('triggering-amount').textContent).toMatch(/42\.50/);
    expect(screen.getByTestId('triggering-date')).toHaveTextContent('2026-01-15');
    expect(screen.getByTestId('triggering-account')).toHaveTextContent('Amex');
  });

  it("renders 'assigned entity: <name>' when there is no previous entity", async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-diff')).toHaveTextContent('assigned entity: Woolworths');
  });

  it("renders 'was → now' diff line for an entity rename", async () => {
    seedTwoAddOps();
    renderDialog({
      triggeringTransaction: {
        ...TRIGGERING_TRANSACTION,
        previousEntityName: 'Coles',
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-diff')).toHaveTextContent('entity: Coles → Woolworths');
  });

  it("renders 'was → now' diff line for a transaction-type change", async () => {
    seedTwoAddOps();
    renderDialog({
      signal: { ...SIGNAL, transactionType: 'transfer' as const },
      triggeringTransaction: {
        ...TRIGGERING_TRANSACTION,
        previousTransactionType: 'purchase' as const,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('triggering-diff')).toHaveTextContent('type: purchase → transfer');
  });

  it('Apply is disabled when the ChangeSet is empty', async () => {
    mockProposeData = {
      changeSet: { source: 'test', ops: [] },
      rationale: 'empty',
      preview: {
        counts: {
          affected: 0,
          entityChanges: 0,
          locationChanges: 0,
          tagChanges: 0,
          typeChanges: 0,
        },
        affected: [],
      },
    };
    // ChangeSetSchema requires min(1) ops, but the dialog must still defend
    // against the "user deleted everything" case which produces an empty
    // local ops array client-side.
    renderDialog();

    // With zero ops the ops-list panel renders the empty state and the
    // Apply button is disabled. We assert via the empty-state copy in the
    // ops list (which contains a unique trailing instruction) plus the
    // Apply disabled state.
    await waitFor(() => {
      expect(
        screen.getByText(/ChangeSet is empty\. Add an operation below\./i)
      ).toBeInTheDocument();
    });

    const applyBtn = screen.getByRole('button', { name: /Apply ChangeSet/i });
    expect(applyBtn).toBeDisabled();
  });
});

describe('US-14: Save & Learn — acceptance criteria', () => {
  // AC-2 / AC-3: Opening the dialog shows a bundled ChangeSet proposal that
  // includes proposed rule patterns, match types, and rationale.
  it('AC2+AC3: dialog shows the bundled ChangeSet with proposed rule patterns and rationale', async () => {
    seedTwoAddOps();
    renderDialog();

    // The ops list panel reflects the bundled ChangeSet.
    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    // Proposed patterns are visible in the ops list.
    expect(screen.getByText(/WOOLWORTHS → Woolworths/)).toBeInTheDocument();
    expect(screen.getByText(/COLES → Coles/)).toBeInTheDocument();

    // The context panel shows the proposed rule's match type in the "Proposed rule"
    // description sentence. Scope the query to the specific element to avoid
    // false positives from unrelated UI text (e.g. select option values).
    const proposedRuleEl = screen.getByTestId('proposed-rule-description');
    expect(within(proposedRuleEl).getByText(/contains/i)).toBeInTheDocument();

    // Rationale from the proposal is shown in the context panel.
    expect(screen.getByText('Test proposal')).toBeInTheDocument();
  });

  // AC-3 (impact preview): After the auto-preview runs, the ImpactPanel shows
  // the "checked" count badge reflecting how many import transactions were
  // scoped and evaluated. The preview is triggered automatically on open and
  // results are computed from the returned diffs.
  it('AC3: impact panel is present and preview is triggered for the current import transactions', async () => {
    seedTwoAddOps();

    // Return a diff for each of the two preview transactions so the panel
    // has something to display beyond the empty-state.
    mockPreviewMutateAsync.mockResolvedValue({
      diffs: [
        {
          checksum: 'a',
          description: 'WOOLWORTHS 1234 SYD',
          changed: true,
          before: { matched: false, status: 'unmatched' },
          after: { matched: true, status: 'matched', entityName: 'Woolworths' },
        },
        {
          checksum: 'b',
          description: 'COLES 9999 NEW',
          changed: true,
          before: { matched: false, status: 'unmatched' },
          after: { matched: true, status: 'matched', entityName: 'Coles' },
        },
      ],
      summary: {
        total: 2,
        newMatches: 2,
        removedMatches: 0,
        statusChanges: 0,
        netMatchedDelta: 2,
      },
    });

    renderDialog();

    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    // The combined-preview call must include the full set of import transactions
    // from the previewTransactions prop (both WOOLWORTHS and COLES). The
    // selected-op preview call scopes to the subset matching that op's pattern
    // and may include fewer transactions — but at least one call must cover all.
    const calls = mockPreviewMutateAsync.mock.calls as Array<
      [{ changeSet: { ops: unknown[] }; transactions: Array<{ description: string }> }]
    >;
    const expectedDescriptions = ['COLES 9999 NEW', 'WOOLWORTHS 1234 SYD'];
    const combinedPreviewCall = calls.find(([arg]) => {
      const descriptions = arg.transactions.map((t) => t.description).toSorted();
      return JSON.stringify(descriptions) === JSON.stringify(expectedDescriptions);
    });
    expect(combinedPreviewCall).toBeDefined();

    // The ImpactPanel renders the "Will change" section when diffs are present.
    // The default view is "selected" (first op), which scopes to WOOLWORTHS only.
    await waitFor(() => {
      expect(screen.getByText(/Will change \(1\)/i)).toBeInTheDocument();
    });
  });

  // AC-5: Reject requires a non-empty feedback message. The Confirm button is
  // disabled until the user types something.
  it('AC5: reject confirm button is disabled until feedback is provided', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Reject with feedback/i }));

    const confirmBtn = screen.getByRole('button', { name: /Confirm reject/i });

    // Disabled before any input.
    expect(confirmBtn).toBeDisabled();

    // Whitespace-only input must NOT unlock the button (trimmed check).
    const feedbackBox = screen.getByPlaceholderText(/Why is this proposal wrong/i);
    fireEvent.change(feedbackBox, { target: { value: '   ' } });
    expect(confirmBtn).toBeDisabled();

    // Non-empty feedback unlocks the button.
    fireEvent.change(feedbackBox, { target: { value: 'Pattern is too broad' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  // AC-6: After rejecting, the AI helper is available to generate a follow-up
  // proposal incorporating the user's feedback (reviseChangeSet mutation).
  it('AC6: AI helper generates a follow-up proposal incorporating user feedback', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/Operations \(2\)/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/split location into its own rule/i);
    fireEvent.change(input, { target: { value: 'Pattern is too broad, use exact match' } });
    fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));

    await waitFor(() => {
      expect(mockReviseMutateAsync).toHaveBeenCalledTimes(1);
    });

    const call = mockReviseMutateAsync.mock.calls[0]?.[0] as {
      instruction: string;
      currentChangeSet: { ops: unknown[] };
    };
    // The feedback is passed verbatim as the instruction.
    expect(call.instruction).toBe('Pattern is too broad, use exact match');

    // The revised proposal replaces the ops in the dialog.
    await waitFor(() => {
      expect(screen.getByText(/Operations \(1\)/)).toBeInTheDocument();
    });
  });

  // AC-7: No rule changes happen without explicit approval. Merely opening the
  // dialog (which triggers proposeChangeSet and previewChangeSet) must NOT call
  // addPendingChangeSet.
  it('AC7: opening the dialog does not apply any rule changes without explicit approval', async () => {
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      // The auto-preview running confirms the proposal was fetched and rendered.
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });

    expect(mockAddPendingChangeSet).not.toHaveBeenCalled();
  });
});

describe('CorrectionProposalDialog — impact reaches past the import', () => {
  // A rule approved mid-import keeps re-deciding rows long after the run ends,
  // so an impact panel scoped to the session understates what the user is
  // agreeing to. The proposal dialog used to pass no DB rows at all.
  function seedDbRows() {
    mockDescriptionsForPreview.mockResolvedValue({
      data: {
        data: [
          { checksum: 'db-1', description: 'WOOLWORTHS 4321 MELB' },
          { checksum: 'db-2', description: 'WOOLWORTHS METRO 77' },
        ],
        total: 2,
        truncated: false,
      },
      error: undefined,
    });
  }

  it('previews the proposed rules against committed transactions, not just the import', async () => {
    seedTwoAddOps();
    seedDbRows();
    renderDialog();

    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });
    await waitFor(() => {
      const descriptions = mockPreviewMutateAsync.mock.calls
        .flatMap(
          (call) => (call[0] as { transactions: Array<{ description: string }> }).transactions
        )
        .map((t) => t.description);
      expect(descriptions).toContain('WOOLWORTHS 4321 MELB');
      // The session rows are still previewed alongside them.
      expect(descriptions).toContain('WOOLWORTHS 1234 SYD');
    });
  });

  it('splits the panel into import and existing sections once the DB rows load', async () => {
    seedTwoAddOps();
    seedDbRows();
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Existing transactions')).toBeInTheDocument();
    });
    expect(screen.getByText('Import transactions')).toBeInTheDocument();
  });

  it('still names the database section when nothing committed matches', async () => {
    // Silence is ambiguous — an absent section reads as "not checked" rather
    // than "checked, nothing hit", which is the answer the user needs before
    // approving a rule.
    seedTwoAddOps();
    renderDialog();

    await waitFor(() => {
      expect(mockPreviewMutateAsync).toHaveBeenCalled();
    });
    expect(screen.getByText('Existing transactions')).toBeInTheDocument();
    expect(screen.getByText('No existing transactions match.')).toBeInTheDocument();
  });
});
