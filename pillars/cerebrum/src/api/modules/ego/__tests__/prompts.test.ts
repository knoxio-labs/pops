import { describe, expect, it } from 'vitest';

import { buildEgoSystemPrompt, formatAppContextBlock } from '../prompts.js';

const contextWithUri = {
  app: 'finance',
  route: '/finance/transactions/tx_1',
  uri: 'pops:finance/transaction/tx_1',
  entityType: 'transaction',
  entityId: 'tx_1',
  entityTitle: 'Coffee',
};

const legacyContextBlock =
  '\n\nCurrent app context:\n' +
  [
    'The user is currently in the Finance app (transactions, budgets, entities, imports).',
    'Current route: /finance/transactions/tx_1',
    'Object URI: pops:finance/transaction/tx_1',
    'Viewing transaction: Coffee (tx_1)',
    'You can see only the title and id of this transaction, not its contents. Do not guess at details it does not carry.',
  ].join('\n');

const legacyPrompt = [
  'You are Ego, the conversational interface to Cerebrum — a personal knowledge management system.',
  '',
  'Your capabilities:',
  "- Search and retrieve knowledge from the user's engram library",
  '- Answer questions grounded in stored engrams',
  '- Help the user explore connections between their stored knowledge',
  '',
  'Active scopes for this conversation: personal.finance' + legacyContextBlock,
  '',
  'When referencing engrams, always cite them by ID in square brackets: [eng_YYYYMMDD_HHmm_slug]',
  "If the available context doesn't contain enough information, say so explicitly rather than guessing.",
].join('\n');

describe('tool-aware Ego system prompt', () => {
  it('preserves the exact legacy output when tools are absent or false', () => {
    expect(formatAppContextBlock(contextWithUri)).toBe(legacyContextBlock);
    expect(formatAppContextBlock(contextWithUri, { tools: false })).toBe(legacyContextBlock);

    const withoutOption = buildEgoSystemPrompt(['personal.finance'], contextWithUri);
    const withToolsFalse = buildEgoSystemPrompt(['personal.finance'], contextWithUri, {
      tools: false,
    });

    expect(withoutOption).toBe(legacyPrompt);
    expect(withToolsFalse).toBe(legacyPrompt);
    expect(withoutOption).not.toContain('ego_show_entities');
    expect(withoutOption).not.toContain('ego_navigate');
    expect(withToolsFalse).not.toContain('ego_show_entities');
    expect(withToolsFalse).not.toContain('ego_navigate');
  });

  it('states tool rules in order and preserves multi-action approvals and results', () => {
    const prompt = buildEgoSystemPrompt(['personal.finance', 'work.notes'], undefined, {
      tools: true,
    });
    const orderedAnchors = [
      'You are Ego, the assistant for the whole of POPS: finance, purchases, inventory, media and the Cerebrum knowledge base.',
      'Read data through the provided tools and answer from their results.',
      'Use ego_show_entities as the only way to show a card.',
      'Use ego_navigate to open a screen only when the user asks to go somewhere.',
      'Do not execute a tool that changes data unless the user has allowed that tool for this conversation.',
      'History lines in square brackets beginning with shown: or action',
      'Cite an engram by its id in square brackets only when it appears in the retrieved knowledge block of the current message.',
      'Active scopes for this conversation: personal.finance, work.notes',
    ];
    const positions = orderedAnchors.map((anchor) => prompt.indexOf(anchor));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].toSorted((left, right) => left - right));
    expect(prompt).toContain(
      'Pass URIs exactly as they appear in a tool result or the app context; never construct one.'
    );
    expect(prompt).toContain('When data is unavailable, say so.');
    expect(prompt).toContain(
      'Show the proposed changes to the user together so the user can approve or decline each.'
    );
    expect(prompt).toContain(
      "Return the result of every call, or a note that the user declined it, as that call's tool result."
    );
    expect(prompt).toContain('Say in one sentence what will change before calling such tools.');
    expect(prompt).toContain('You may propose several changes in one turn.');
    expect(prompt).toContain(
      'Never state that a change happened unless its tool result says it did, and do not propose a declined change again unless the user asks for it.'
    );
    expect(prompt).toContain(
      "Action lines at the very start of the user's message are written by the system, not typed by the user:"
    );
    expect(prompt).toContain('an interrupted action may or may not have happened.');
    expect(prompt).not.toMatch(
      /(?:only one|a single|one) (?:change|write|mutation)s? (?:per|in) turn/i
    );
  });

  it('adds a read-first instruction for a URI and removes the title-and-id limitation', () => {
    const block = formatAppContextBlock(contextWithUri, { tools: true });

    expect(block).toContain('Current route: /finance/transactions/tx_1');
    expect(block).toContain('Object URI: pops:finance/transaction/tx_1');
    expect(block).toContain('Viewing transaction: Coffee (tx_1)');
    expect(block).not.toContain('You can see only the title and id');
    expect(
      block.endsWith(
        'The user is looking at pops:finance/transaction/tx_1. Read it with the matching tool before answering questions about it.'
      )
    ).toBe(true);
  });

  it('keeps the title-and-id context when tools are enabled without a URI', () => {
    const block = formatAppContextBlock(
      {
        app: 'purchases',
        entityType: 'purchase',
        entityId: '42',
        entityTitle: 'Drill',
      },
      { tools: true }
    );

    expect(block).toContain('Viewing purchase: Drill (42)');
    expect(block).toContain(
      'You can see only the title and id of this purchase, not its contents.'
    );
    expect(block).not.toContain('Read it with the matching tool');
  });
});
