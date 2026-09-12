import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNextStep = vi.fn();
const mockPrevStep = vi.fn();
const mockAddPendingTagRuleChangeSet = vi.fn();
const mockRemovePendingTagRuleChangeSet = vi.fn();

let storeState: Record<string, unknown> = {};

const taxonomy: { facets: Array<{ facet: string; kind: string }>; tags: string[] } = {
  facets: [],
  tags: [],
};

const { mockResolveCollisions } = vi.hoisted(() => ({ mockResolveCollisions: vi.fn() }));
let collisions: unknown[][] = [];

vi.mock('../../finance-api/index.js', () => ({
  tagRulesFacets: async () => ({ data: { facets: taxonomy.facets }, error: undefined }),
  tagRulesVocabulary: async () => ({ data: { tags: taxonomy.tags }, error: undefined }),
  tagRulesResolveAddCollisions: (...args: unknown[]) => mockResolveCollisions(...args),
}));

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

import { RuleCreationStep } from './RuleCreationStep';

function withQuery(ui: ReactElement): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function makeTxn(overrides: Record<string, unknown> = {}) {
  return {
    description: 'WOOLWORTHS 1034 SYDNEY',
    date: '2026-01-01',
    amount: -25.5,
    dialectAccountLabel: 'Amex',
    rawRow: '{}',
    checksum: 'abc',
    entityId: 'entity-woolworths',
    entityName: 'Woolworths',
    tags: ['Groceries'],
    ...overrides,
  };
}

function stagedRule(options: {
  tempId: string;
  source: string;
  sourceChecksums: string[];
  descriptionPattern?: string;
  tags?: string[];
}) {
  return {
    tempId: options.tempId,
    source: options.source,
    appliedAt: '2026-09-12T00:00:00.000Z',
    sourceChecksums: options.sourceChecksums,
    changeSet: {
      source: options.source,
      ops: [
        {
          op: 'add',
          data: {
            descriptionPattern: options.descriptionPattern ?? 'WOOLWORTHS 1034 SYDNEY',
            matchType: 'contains',
            entityId: 'entity-woolworths',
            tags: options.tags ?? ['Groceries'],
            confidence: 0.9,
            isActive: true,
          },
        },
      ],
    },
  };
}

function twoWoolworthsRows() {
  return [makeTxn(), makeTxn({ checksum: 'abc2' })];
}

function tickAll() {
  for (const box of screen.getAllByRole('checkbox')) {
    if (!box.hasAttribute('disabled')) fireEvent.click(box);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  taxonomy.facets = [];
  taxonomy.tags = [];
  collisions = [];
  mockResolveCollisions.mockImplementation(async () => ({
    data: { collisions },
    error: undefined,
  }));
  storeState = {
    confirmedTransactions: [],
    pendingTagRuleChangeSets: [],
    nextStep: mockNextStep,
    prevStep: mockPrevStep,
    addPendingTagRuleChangeSet: mockAddPendingTagRuleChangeSet,
    removePendingTagRuleChangeSet: mockRemovePendingTagRuleChangeSet,
  };
});

describe('RuleCreationStep', () => {
  it('shows empty state when no tagged transactions', () => {
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByText(/No tag patterns detected/i)).toBeInTheDocument();
  });

  it('shows Skip button in empty state', () => {
    render(withQuery(<RuleCreationStep />));
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(mockNextStep).toHaveBeenCalledOnce();
  });

  it('shows a proposal card for an entity with consistent tags', () => {
    storeState.confirmedTransactions = twoWoolworthsRows();
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByText('Woolworths')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText(/2 transactions/i)).toBeInTheDocument();
  });

  it('starts with nothing ticked, however many rows back a proposal (POPS-3676)', () => {
    storeState.confirmedTransactions = twoWoolworthsRows();
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Create.*rule/i })).toBeDisabled();
  });

  it('creates rules for the proposals ticked', () => {
    storeState.confirmedTransactions = twoWoolworthsRows();
    render(withQuery(<RuleCreationStep />));
    tickAll();
    fireEvent.click(screen.getByRole('button', { name: /Create.*rule/i }));
    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledOnce();
    expect(mockNextStep).toHaveBeenCalledOnce();
    const call = mockAddPendingTagRuleChangeSet.mock.calls[0]![0];
    expect(call.source).toBe('import-batch');
    expect(call.changeSet.ops[0].op).toBe('add');
    expect(call.changeSet.ops[0].data.descriptionPattern).toBe('WOOLWORTHS 1034 SYDNEY');
    expect(call.changeSet.ops[0].data.tags).toEqual(['Groceries']);
  });

  it('carries the proposal tags as acceptedNewTags, so they gain vocabulary standing', () => {
    storeState.confirmedTransactions = twoWoolworthsRows();
    render(withQuery(<RuleCreationStep />));
    tickAll();
    fireEvent.click(screen.getByRole('button', { name: /Create.*rule/i }));
    const call = mockAddPendingTagRuleChangeSet.mock.calls[0]![0];
    expect(call.acceptedNewTags).toEqual(['Groceries']);
  });

  it('stages only the proposals ticked', () => {
    storeState.confirmedTransactions = [
      makeTxn({ entityId: 'e1', entityName: 'Woolworths' }),
      makeTxn({ entityId: 'e1', entityName: 'Woolworths', checksum: 'w2' }),
      makeTxn({
        entityId: 'e2',
        entityName: 'Ampol',
        description: 'AMPOL FOODARY 4521 ROZELLE',
        tags: ['Charging', 'EV'],
        checksum: 'x2',
      }),
      makeTxn({
        entityId: 'e2',
        entityName: 'Ampol',
        description: 'AMPOL FOODARY 4521 ROZELLE',
        tags: ['Charging', 'EV'],
        checksum: 'x3',
      }),
    ];
    render(withQuery(<RuleCreationStep />));
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    fireEvent.click(screen.getByRole('button', { name: /Create.*rule/i }));
    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledOnce();
    const call = mockAddPendingTagRuleChangeSet.mock.calls[0]![0];
    expect(call.changeSet.ops[0].data.descriptionPattern).toBe('AMPOL FOODARY 4521 ROZELLE');
  });

  it('skip advances without creating rules', () => {
    storeState.confirmedTransactions = [makeTxn()];
    render(withQuery(<RuleCreationStep />));
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(mockAddPendingTagRuleChangeSet).not.toHaveBeenCalled();
    expect(mockNextStep).toHaveBeenCalledOnce();
  });

  it('excludes transactions with no tags from proposals', () => {
    storeState.confirmedTransactions = [makeTxn({ tags: [] }), makeTxn({ tags: undefined })];
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByText(/No tag patterns detected/i)).toBeInTheDocument();
  });

  it('offers nothing for a tag every row got from a stored rule', () => {
    const supplied = [{ tag: 'Groceries', source: 'rule', pattern: 'WOOLWORTHS' }];
    storeState.confirmedTransactions = [
      makeTxn({ suggestedTags: supplied }),
      makeTxn({ checksum: 'abc2', suggestedTags: supplied }),
    ];
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByText(/No tag patterns detected/i)).toBeInTheDocument();
  });

  it('offers nothing a rule staged on Tag Review already covers', () => {
    storeState.confirmedTransactions = twoWoolworthsRows();
    storeState.pendingTagRuleChangeSets = [
      stagedRule({
        tempId: 'review-1',
        source: 'tag-review:Woolworths',
        sourceChecksums: ['abc', 'abc2'],
        descriptionPattern: 'Woolworths',
      }),
    ];
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByText(/No tag patterns detected/i)).toBeInTheDocument();
  });

  it('shows a Back button that calls prevStep, in the empty state', () => {
    render(withQuery(<RuleCreationStep />));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(mockPrevStep).toHaveBeenCalledOnce();
    expect(mockNextStep).not.toHaveBeenCalled();
  });

  it('shows a Back button that calls prevStep, with proposals present', () => {
    storeState.confirmedTransactions = [makeTxn()];
    render(withQuery(<RuleCreationStep />));
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(mockPrevStep).toHaveBeenCalledOnce();
    expect(mockAddPendingTagRuleChangeSet).not.toHaveBeenCalled();
    expect(mockRemovePendingTagRuleChangeSet).not.toHaveBeenCalled();
  });

  it('only includes tags appearing on ≥50% of transactions in a group', () => {
    storeState.confirmedTransactions = [
      makeTxn({ tags: ['Groceries', 'Organic'] }),
      makeTxn({ tags: ['Groceries'], checksum: 'x2' }),
      makeTxn({ tags: ['Groceries'], checksum: 'x3' }),
    ];
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('Organic')).not.toBeInTheDocument();
  });
});

describe('RuleCreationStep — a previous visit’s rules (POPS-3676)', () => {
  function withEarlierVisit() {
    storeState.confirmedTransactions = twoWoolworthsRows();
    storeState.pendingTagRuleChangeSets = [
      stagedRule({ tempId: 'batch-1', source: 'import-batch', sourceChecksums: ['abc', 'abc2'] }),
      stagedRule({
        tempId: 'review-1',
        source: 'tag-review:Coles',
        sourceChecksums: ['coles-1'],
        descriptionPattern: 'COLES',
      }),
    ];
  }

  it('keeps an earlier visit’s choice ticked on return', () => {
    withEarlierVisit();
    render(withQuery(<RuleCreationStep />));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('replaces what an earlier visit staged instead of adding to it', () => {
    withEarlierVisit();
    render(withQuery(<RuleCreationStep />));
    fireEvent.click(screen.getByRole('button', { name: /Create.*rule/i }));
    expect(mockRemovePendingTagRuleChangeSet.mock.calls).toEqual([['batch-1']]);
    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledOnce();
    expect(mockRemovePendingTagRuleChangeSet.mock.invocationCallOrder[0]).toBeLessThan(
      mockAddPendingTagRuleChangeSet.mock.invocationCallOrder[0]!
    );
  });

  it('drops what an earlier visit staged when skipped', () => {
    withEarlierVisit();
    render(withQuery(<RuleCreationStep />));
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(mockRemovePendingTagRuleChangeSet.mock.calls).toEqual([['batch-1']]);
    expect(mockAddPendingTagRuleChangeSet).not.toHaveBeenCalled();
    expect(mockNextStep).toHaveBeenCalledOnce();
  });
});

describe('RuleCreationStep — existing rules (POPS-3676)', () => {
  it('says when a proposal would re-enable a rule you disabled, and leaves it unticked', async () => {
    collisions = [[{ ruleId: 'r1', existingTags: ['Groceries'], isActive: false }]];
    storeState.confirmedTransactions = twoWoolworthsRows();
    render(withQuery(<RuleCreationStep />));
    expect(await screen.findByText(/re-enables a rule you disabled/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('says when a proposal would add to an existing rule', async () => {
    collisions = [[{ ruleId: 'r1', existingTags: ['Groceries'], isActive: true }]];
    storeState.confirmedTransactions = twoWoolworthsRows();
    render(withQuery(<RuleCreationStep />));
    expect(await screen.findByText(/adds to an existing rule/i)).toBeInTheDocument();
  });

  it('says nothing about a rule that does not exist yet', async () => {
    collisions = [[null]];
    storeState.confirmedTransactions = twoWoolworthsRows();
    render(withQuery(<RuleCreationStep />));
    await waitFor(() => {
      expect(mockResolveCollisions).toHaveBeenCalled();
    });
    expect(screen.queryByText(/adds to an existing rule|re-enables a rule/i)).toBeNull();
  });
});

describe('RuleCreationStep — rule provenance (POPS-3106)', () => {
  it('stages the checksums of exactly the rows the proposal was built from', () => {
    storeState.confirmedTransactions = [makeTxn({ checksum: 'w-1' }), makeTxn({ checksum: 'w-2' })];
    render(withQuery(<RuleCreationStep />));
    tickAll();
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    const call = mockAddPendingTagRuleChangeSet.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.sourceChecksums).toEqual(['w-1', 'w-2']);
  });

  it('gives each proposal its own rows, never another merchant’s', () => {
    const coles = { description: 'COLES 555', entityId: 'entity-coles', entityName: 'Coles' };
    storeState.confirmedTransactions = [
      makeTxn({ checksum: 'w-1' }),
      makeTxn({ checksum: 'w-2' }),
      makeTxn({ checksum: 'c-1', ...coles }),
      makeTxn({ checksum: 'c-2', ...coles }),
    ];
    render(withQuery(<RuleCreationStep />));
    tickAll();
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    const staged = new Map(
      mockAddPendingTagRuleChangeSet.mock.calls.map(([arg]) => [
        arg.changeSet.ops[0].data.entityId,
        arg.sourceChecksums,
      ])
    );
    expect(staged.get('entity-woolworths')).toEqual(['w-1', 'w-2']);
    expect(staged.get('entity-coles')).toEqual(['c-1', 'c-2']);
  });

  it('never stages a rule with no provenance, which reconciliation would drop whole', () => {
    storeState.confirmedTransactions = [makeTxn({ checksum: 'w-1' }), makeTxn({ checksum: 'w-2' })];
    render(withQuery(<RuleCreationStep />));
    tickAll();
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(mockAddPendingTagRuleChangeSet.mock.calls.length).toBeGreaterThan(0);
    for (const [arg] of mockAddPendingTagRuleChangeSet.mock.calls) {
      expect(arg.sourceChecksums.length).toBeGreaterThan(0);
    }
  });
});

describe('RuleCreationStep — closed tag axes (POPS-3106)', () => {
  function closedVenueImport() {
    taxonomy.facets = [{ facet: 'venue', kind: 'closed' }];
    taxonomy.tags = ['venue:bar'];
    storeState = {
      ...storeState,
      confirmedTransactions: [
        makeTxn({ checksum: 'a', tags: ['venue:speakeasy'] }),
        makeTxn({ checksum: 'b', tags: ['venue:speakeasy'] }),
      ],
    };
  }

  it('names a closed-axis value the vocabulary does not hold on its proposal', async () => {
    closedVenueImport();
    render(withQuery(<RuleCreationStep />));
    expect((await screen.findByRole('alert')).textContent).toContain('venue:speakeasy');
  });

  it('stages the valid proposal and not the refused one, though both were ticked', async () => {
    taxonomy.facets = [{ facet: 'venue', kind: 'closed' }];
    taxonomy.tags = ['venue:bar'];
    storeState = {
      ...storeState,
      confirmedTransactions: [
        makeTxn({
          checksum: 'a',
          entityId: 'e-speakeasy',
          entityName: 'Speakeasy',
          tags: ['venue:speakeasy'],
        }),
        makeTxn({
          checksum: 'b',
          entityId: 'e-speakeasy',
          entityName: 'Speakeasy',
          tags: ['venue:speakeasy'],
        }),
        makeTxn({
          checksum: 'c',
          entityId: 'e-griffin',
          entityName: 'Griffin',
          tags: ['venue:bar'],
        }),
        makeTxn({
          checksum: 'd',
          entityId: 'e-griffin',
          entityName: 'Griffin',
          tags: ['venue:bar'],
        }),
      ],
    };
    render(withQuery(<RuleCreationStep />));
    await screen.findByRole('alert');
    tickAll();
    fireEvent.click(screen.getByRole('button', { name: /create 1 rule/i }));
    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledTimes(1);
    const staged = JSON.stringify(mockAddPendingTagRuleChangeSet.mock.calls);
    expect(staged).toContain('venue:bar');
    expect(staged).not.toContain('venue:speakeasy');
  });

  it('stages a closed-axis value the vocabulary holds', async () => {
    taxonomy.facets = [{ facet: 'venue', kind: 'closed' }];
    taxonomy.tags = ['venue:bar'];
    storeState = {
      ...storeState,
      confirmedTransactions: [
        makeTxn({ checksum: 'a', tags: ['venue:bar'] }),
        makeTxn({ checksum: 'b', tags: ['venue:bar'] }),
      ],
    };
    render(withQuery(<RuleCreationStep />));
    await waitFor(() => {
      expect(screen.getByRole('checkbox')).not.toBeDisabled();
    });
    tickAll();
    fireEvent.click(await screen.findByRole('button', { name: /create 1 rule/i }));
    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
