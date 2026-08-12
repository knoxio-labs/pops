import type { AnalyticsMerchantSpendResponses } from '../../purchases-api/types.gen.js';

type MerchantSpendRollup = AnalyticsMerchantSpendResponses['200'];

export type MerchantSpend = MerchantSpendRollup['merchants'][number];
export type CurrencySpend = MerchantSpendRollup['totals'][number];
export type MerchantIdentity = MerchantSpend['merchant'];
export type MerchantResolution = MerchantIdentity['resolution'];
export type SpendAccounting = MerchantSpend['accounting'];
export type SpendPeriod = MerchantSpendRollup['period'];
