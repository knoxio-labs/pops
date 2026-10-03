import { describe, expect, it } from 'vitest';

import { allTools } from './index.js';

describe('gateway tool read-only flags', () => {
  it('marks every non-inventory tool read-only except pairing-code issuance', () => {
    const gatewayTools = allTools.filter((tool) => !tool.name.startsWith('inventory.'));

    for (const tool of gatewayTools) {
      const expected = tool.name !== 'bfm.devicePairing.issueCode';
      expect(tool.readOnly, `unexpected readOnly flag: ${tool.name}`).toBe(expected);
    }
  });

  it('marks pairing-code issuance as writable', () => {
    expect(allTools.find((tool) => tool.name === 'bfm.devicePairing.issueCode')?.readOnly).toBe(
      false
    );
  });

  it.each([
    'finance.transactions.list',
    'media.library.list',
    'cerebrum.search',
    'purchases.search',
  ])('marks %s as read-only', (name) => {
    expect(allTools.find((tool) => tool.name === name)?.readOnly).toBe(true);
  });
});
