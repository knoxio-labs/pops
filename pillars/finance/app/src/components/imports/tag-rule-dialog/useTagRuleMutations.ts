import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import { tagRulesReject, type TagRulesRejectData } from '../../../finance-api/index.js';
import {
  collectNewTagNames,
  parseTags,
  type ProposeOutput,
  type RejectOutput,
  type TagRuleProposalDialogProps,
} from './types';

type RejectBody = NonNullable<TagRulesRejectData['body']>;

interface FormStateForMutations {
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  tagsText: string;
  rejectFeedback: string;
  acceptedNewTags: Set<string>;
  setFollowUpProposal: React.Dispatch<React.SetStateAction<ProposeOutput | null>>;
  setRejectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRejectFeedback: React.Dispatch<React.SetStateAction<string>>;
}

interface MutationsArgs {
  props: TagRuleProposalDialogProps;
  form: FormStateForMutations;
  proposal: ProposeOutput | undefined;
}

function buildRejectInput(
  proposal: ProposeOutput,
  props: TagRuleProposalDialogProps,
  form: FormStateForMutations,
  feedback: string
): RejectBody | null {
  if (!props.signal) return null;
  return {
    changeSet: proposal.changeSet,
    feedback,
    signal: {
      descriptionPattern: form.pattern.trim() || props.signal.descriptionPattern,
      matchType: form.matchType,
      entityId: props.signal.entityId,
      tags: parseTags(form.tagsText.trim() ? form.tagsText : props.signal.tags.join(', ')),
    },
    transactions: props.previewTransactions.map((t) => ({
      transactionId: t.checksum,
      description: t.description,
      entityId: t.entityId ?? null,
    })),
    maxPreviewItems: 200,
  };
}

export function useTagRuleMutations(args: MutationsArgs) {
  const { props, form, proposal } = args;
  const rejectMutation = useMutation({
    mutationFn: async (vars: RejectBody): Promise<RejectOutput> =>
      unwrap(await tagRulesReject({ body: vars })),
    onSuccess: (data: RejectOutput) => {
      if (data.followUpProposal) {
        form.setFollowUpProposal(data.followUpProposal);
        form.setRejectOpen(false);
        form.setRejectFeedback('');
        toast.message('Proposal revised based on your feedback');
      } else {
        toast.message('Proposal dismissed');
        props.onOpenChange(false);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * Stage the proposal — no DB write. The rule and its accepted new tags reach
   * the database once, through `commitImport` on Final Review; writing here too
   * used to persist the same rule twice, inflating `confidence` and
   * `timesApplied` on a rule that had never fired (POPS-2597).
   */
  const handleApply = useCallback(() => {
    if (!proposal) return;
    toast.success('Tag rule staged — saved when you commit the import');
    props.onApplied?.(proposal.changeSet, proposal.preview.affected, [...form.acceptedNewTags]);
    props.onOpenChange(false);
  }, [proposal, form.acceptedNewTags, props]);

  const handleReject = useCallback(() => {
    if (!proposal) return;
    const fb = form.rejectFeedback.trim();
    if (fb.length === 0) {
      toast.error('Please add a short note explaining why you are rejecting this proposal.');
      return;
    }
    const input = buildRejectInput(proposal, props, form, fb);
    if (input) rejectMutation.mutate(input);
  }, [proposal, props, rejectMutation, form]);

  return { rejectMutation, handleApply, handleReject };
}

export { collectNewTagNames };
