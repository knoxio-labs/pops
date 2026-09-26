/** Pure item-detail layout and aggregate contracts. */
export {
  buildDetailFacts,
  buildDetailProvenance,
  buildDetailSectionSummaries,
  buildItemDetailAggregate,
} from './detail-model';
export { detailViewState } from './detail-states';
export { RAIL_DEFAULT, RAIL_MAX, RAIL_MIN, RAIL_STEP, clampRail, moveRail } from './rail-width';

export type {
  DetailFact,
  DetailHistoryEvent,
  DetailPhoto,
  DetailProvenance,
  DetailSectionCounts,
  DetailSectionId,
  DetailSectionSummary,
  FactOrigin,
  ItemConnection,
  ItemDetailAggregate,
  LegacyItem,
  LinkedDocument,
  LocationNode,
  PaperlessState,
  WebItem,
} from './detail-types';
export type { DetailViewState } from './detail-states';
