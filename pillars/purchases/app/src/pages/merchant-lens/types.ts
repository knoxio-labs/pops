import type {
  AnalyticsMerchantSpendResponses,
  PurchaseListResponses,
} from '../../purchases-api/types.gen.js';

type MerchantSpendRollup = AnalyticsMerchantSpendResponses['200'];

export type MerchantSpend = MerchantSpendRollup['merchants'][number];
export type CurrencySpend = MerchantSpendRollup['totals'][number];
export type MerchantIdentity = MerchantSpend['merchant'];
export type MerchantResolution = MerchantIdentity['resolution'];
export type SpendAccounting = MerchantSpend['accounting'];
export type SpendPeriod = MerchantSpendRollup['period'];

/** One order behind a merchant row, as the order index returns it. */
export type MerchantOrder = PurchaseListResponses['200']['items'][number];
