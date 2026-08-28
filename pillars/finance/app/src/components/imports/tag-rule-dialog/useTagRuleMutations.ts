import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  tagRulesApply,
  tagRulesReject,
  type TagRulesApplyData,
  type TagRulesRejectData,
} from '../../../finance-api/index.js';
import {
  collectNewTagNames,
  type ProposeOutput,
  type RejectOutput,
  type TagRuleProposalDialogProps,
} from './types';

type ApplyBody = NonNullable<TagRulesApplyData['body']>;
type RejectBody = NonNullable<TagRulesRejectData['body']>;

interface FormStateForMutations {
  rejectFeedback: string;
  acceptedNewTags: Set<string>;
}

interface MutationsArgs {
  props: TagRuleProposalDialogProps;
  form: FormStateForMutations;
  proposal: ProposeOutput | undefined;
}

export function useTagRuleMutations(args: MutationsArgs) {
  const { props, form, proposal } = args;
  const queryClient = useQueryClient();
  const applyMutation = useMutation({
    mutationFn: async (vars: ApplyBody) => unwrap(await tagRulesApply({ body: vars })),
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectMutation = useMutation({
    mutationFn: async (vars: RejectBody): Promise<RejectOutput> =>
      unwrap(await tagRulesReject({ body: vars })),
    onSuccess: () => {
      toast.message('Rejection recorded');
      props.onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleApply = useCallback(async () => {
    if (!proposal) return;
    const changeSet = proposal.changeSet;
    await applyMutation.mutateAsync({ changeSet, acceptedNewTags: [...form.acceptedNewTags] });
    await queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules'] });
    await queryClient.invalidateQueries({ queryKey: ['finance', 'transactions', 'availableTags'] });
    toast.success('Tag rule saved');
    props.onApplied?.(changeSet, proposal.preview.affected);
    props.onOpenChange(false);
  }, [proposal, applyMutation, form.acceptedNewTags, queryClient, props]);

  const handleReject = useCallback(() => {
    if (!proposal) return;
    const fb = form.rejectFeedback.trim();
    if (fb.length === 0) {
      toast.error('Please add a short note explaining why you are rejecting this proposal.');
      return;
    }
    rejectMutation.mutate({ changeSet: proposal.changeSet, feedback: fb });
  }, [proposal, rejectMutation, form.rejectFeedback]);

  return { applyMutation, rejectMutation, handleApply, handleReject };
}

export { collectNewTagNames };
