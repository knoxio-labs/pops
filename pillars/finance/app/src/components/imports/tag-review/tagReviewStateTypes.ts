import type {
  ConfirmedTransaction,
  SuggestedTag,
  TagRuleChangeSet,
  TagRuleImpactItem,
} from '@pops/finance';

import type { TagFacetOption } from '../../../lib/tags';
import type { ConfirmedGroup } from './tagReviewUtils';
import type { PreviewTransaction } from './usePreviewTransactions';
import type { TagRuleDialogState } from './useTagRuleDialog';

export type { PreviewTransaction };

export interface UseTagReviewStateOutput {
  confirmedTransactions: ConfirmedTransaction[];
  groups: ConfirmedGroup[];
  availableTags: string[];
  /** The tag taxonomy, for the pickers that mint a value on one of its axes. */
  facets: TagFacetOption[];
  localTags: Record<string, string[]>;
  suggestedTagMeta: Record<string, SuggestedTag[]>;
  updateTag: (checksum: string, tags: string[]) => void;
  handleAcceptAll: () => void;
  /** Rows an accept-all would change; zero means the control is inert. */
  unappliedSuggestionCount: number;
  handleApplyGroupTags: (group: ConfirmedGroup, tags: string[]) => void;
  /** Removes one tag from every transaction in a group that carries it. */
  handleRemoveGroupTag: (group: ConfirmedGroup, tag: string) => void;
  handleContinue: () => void;
  prevStep: () => void;
  confirmedCount: number;
  tagRuleDialog: TagRuleDialogState | null;
  setTagRuleDialogOpen: (open: boolean) => void;
  handleOpenTagRuleDialog: (group: ConfirmedGroup) => void;
  handleOpenTagRuleDialogForTransaction: (
    transaction: ConfirmedTransaction,
    tags: string[]
  ) => void;
  previewTransactions: PreviewTransaction[];
  handleTagRuleApplied: (
    changeSet: TagRuleChangeSet,
    affected: TagRuleImpactItem[],
    acceptedNewTags: string[]
  ) => void;
}
