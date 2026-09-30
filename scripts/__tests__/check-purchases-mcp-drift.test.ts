import { describe, expect, it } from 'vitest';

import {
  checkPurchasesMcpCoverage,
  findPurchasesMcpCoverageProblems,
} from '../check-purchases-mcp-drift.mjs';

describe('Purchases OpenAPI and MCP tool coverage', () => {
  it('covers every contract route with a tool or a recorded omission reason', () => {
    expect(checkPurchasesMcpCoverage()).toEqual([]);
  });

  it('requires a new contract operation to be exposed or deliberately omitted', () => {
    expect(
      findPurchasesMcpCoverageProblems({
        operationIds: ['purchase.list', 'analytics.productLeaderboard'],
        toolRoutes: { 'purchase.list': 'purchases.orders.list' },
        omissionReasons: {},
        availableToolNames: new Set(['purchases.orders.list']),
      })
    ).toEqual([
      "Purchases operation 'analytics.productLeaderboard' has no MCP tool or omission reason.",
    ]);
  });

  it('rejects stale route entries, missing tools, and duplicate operation IDs', () => {
    expect(
      findPurchasesMcpCoverageProblems({
        operationIds: ['purchase.list', 'purchase.list'],
        toolRoutes: {
          'purchase.list': 'purchases.orders.list',
          'purchase.unknown': 'purchases.orders.unknown',
        },
        omissionReasons: { 'purchase.unknown': 'Not exposed.' },
        availableToolNames: new Set(),
      })
    ).toEqual([
      'Purchases OpenAPI operation IDs are not unique.',
      "Purchases operation 'purchase.list' maps to missing MCP tool 'purchases.orders.list'.",
      "MCP coverage refers to unknown Purchases operation 'purchase.unknown'.",
      "Purchases operation 'purchase.unknown' maps to missing MCP tool 'purchases.orders.unknown'.",
      "MCP omission refers to unknown Purchases operation 'purchase.unknown'.",
    ]);
  });

  it('rejects omission records without a reason', () => {
    expect(
      findPurchasesMcpCoverageProblems({
        operationIds: ['analytics.monthSummary'],
        toolRoutes: {},
        omissionReasons: { 'analytics.monthSummary': '  ' },
        availableToolNames: new Set(),
      })
    ).toEqual(["Purchases operation 'analytics.monthSummary' has an empty MCP omission reason."]);
  });
});
