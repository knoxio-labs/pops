import type { AnalyticsMerchantSpendResponses } from '../../purchases-api/types.gen';

/**
 * Fictional throughout, following the convention in `pillars/design/src/
 * fixtures/`. Chosen to make the page's own reasoning visible rather than to
 * be the smallest payload that typechecks — a fixture where everything
 * reconciles renders a page that looks right and demonstrates nothing.
 */

/**
 * Two currencies, and inside the larger one all three ways the roll-up can
 * attribute a merchant: to a resolved entity, to a bare printed name, and to
 * nothing at all. The unattributed bucket carries a residual, because a page
 * whose every figure reconciles never shows whether it can say so when one
 * does not.
 */
export const MERCHANT_SPEND: AnalyticsMerchantSpendResponses[200] = {
  period: { from: null, to: null },
  totals: [
    {
      currency: 'AUD',
      accounting: {
        awaitingImportCents: 6195,
        matchedCents: 41859,
        netSpendCents: 48054,
        refundedCents: 0,
        residualCents: 6195,
        totalCents: 48054,
      },
      orderCount: 5,
    },
    {
      currency: 'USD',
      accounting: {
        awaitingImportCents: 0,
        matchedCents: 2999,
        netSpendCents: 2999,
        refundedCents: 0,
        residualCents: 0,
        totalCents: 2999,
      },
      orderCount: 1,
    },
  ],
  merchants: [
    {
      currency: 'AUD',
      merchant: { entityId: 'ent_hardware_barn', name: 'Hardware Barn', resolution: 'entity' },
      orderCount: 2,
      accounting: {
        awaitingImportCents: 1195,
        matchedCents: 33859,
        netSpendCents: 35054,
        refundedCents: 0,
        residualCents: 1195,
        totalCents: 35054,
      },
    },
    {
      currency: 'AUD',
      merchant: { entityId: null, name: 'Grocer & Co', resolution: 'name' },
      orderCount: 2,
      accounting: {
        awaitingImportCents: 500,
        matchedCents: 8000,
        netSpendCents: 8500,
        refundedCents: 0,
        residualCents: 500,
        totalCents: 8500,
      },
    },
    {
      currency: 'AUD',
      merchant: { entityId: null, name: null, resolution: 'unattributed' },
      orderCount: 1,
      accounting: {
        awaitingImportCents: 4500,
        matchedCents: 0,
        netSpendCents: 4500,
        refundedCents: 0,
        residualCents: 4500,
        totalCents: 4500,
      },
    },
    {
      currency: 'USD',
      merchant: { entityId: null, name: 'Parts Direct', resolution: 'name' },
      orderCount: 1,
      accounting: {
        awaitingImportCents: 0,
        matchedCents: 2999,
        netSpendCents: 2999,
        refundedCents: 0,
        residualCents: 0,
        totalCents: 2999,
      },
    },
  ],
};
