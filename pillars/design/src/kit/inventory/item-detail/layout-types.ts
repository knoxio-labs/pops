/**
 * What either E1 layout receives: the model, the page condition, whether
 * the page is read-only, and the section specs both layouts share.
 */
import type { DetailCondition, ItemDetailModel } from './detail-model';
import type { SectionSpec } from './sections';

/** Props for a detail body layout. */
export interface DetailBodyProps {
  model: ItemDetailModel;
  condition: DetailCondition;
  readOnly: boolean;
  sections: readonly SectionSpec[];
  onQuantity?: (action: 'split' | 'change') => void;
}
