import type { DetailTab } from './detail-model-types';

export type {
  DetailConnection,
  DetailDocument,
  DetailFact,
  DetailPhoto,
  DetailProvenance,
  DetailSectionId,
  DetailTab,
  FactOrigin,
  ItemDetailModel,
  PaperlessState,
} from './detail-model-types';

/** Parses the item detail tab parameter, defaulting unknown values to Overview. */
export function parseDetailTab(value: string | null): DetailTab {
  if (value === 'facts' || value === 'connections' || value === 'history') return value;
  return 'overview';
}
export { relatedItemIds, toDetailFacts } from './detail-facts';
export {
  historySummary,
  paperlessStateOf,
  toDetailConnections,
  toDetailDocuments,
  toDetailPhotos,
  toDetailProvenance,
} from './detail-sections';
