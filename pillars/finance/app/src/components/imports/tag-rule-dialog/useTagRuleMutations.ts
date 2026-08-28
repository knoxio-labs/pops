import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import { tagRulesReject, type TagRulesRejectData } from '../../../finance-api/index.js';
import {
  collectNewTagNames,
  type ProposeOutput,
  type RejectOutput,
  type TagRuleProposalDialogProps,
} from './types';

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
  const rejectMutation = useMutation({
    mutationFn: async (vars: RejectBody): Promise<RejectOutput> =>
      unwrap(await tagRulesReject({ body: vars })),
    onSuccess: () => {
      toast.message('Rejection recorded');
      props.onOpenChange(false);
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
    rejectMutation.mutate({ changeSet: proposal.changeSet, feedback: fb });
  }, [proposal, rejectMutation, form.rejectFeedback]);

  return { rejectMutation, handleApply, handleReject };
}

export { collectNewTagNames };
