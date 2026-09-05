import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { dollarsToCents, getAccountKindBehaviour } from '@pops/finance';

import {
  checkpointFormSchema,
  DEFAULT_CHECKPOINT_FORM_VALUES,
  today,
  type CheckpointFormValues,
} from './types';
import { useCheckpointMutations } from './useCheckpointMutations';

import type { CheckpointsCreateData } from '../../finance-api/types.gen.js';
import type { Account } from '../accounts/types';

type CreateBody = NonNullable<CheckpointsCreateData['body']>;

/**
 * The typed balance, negated for a liability kind: the user always types
 * what the real-world statement shows (a positive "amount owed" for a card,
 * the plain balance for an asset), and this is the one place that becomes
 * the ledger-signed figure the wire expects (ADR-051).
 */
function toCreateBody(values: CheckpointFormValues, account: Account): CreateBody {
  const { signConvention } = getAccountKindBehaviour(account.kind);
  const magnitude = dollarsToCents(Number(values.amount));
  const note = values.note.trim();
  return {
    balanceCents: signConvention === 'liability' ? -magnitude : magnitude,
    asOf: values.asOf,
    note: note === '' ? undefined : note,
  };
}

/**
 * The "Add checkpoint" dialog's state and the delete affordance on the
 * history table, both scoped to one account. `account` is nullable only
 * because the page calls this hook before it knows whether the id resolved
 * (rules of hooks) — `openDialog` and the delete button are never reachable
 * from the page until `account` is non-null, so `onSubmit`'s guard is
 * defensive, not a path a real user can hit.
 */
export function useAccountCheckpointsActions(accountId: string, account: Account | null) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { createMutation, deleteMutation } = useCheckpointMutations(accountId);

  // `account` is null on the first renders, and the dialog is unreachable
  // until it resolves; 'asset' is the permissive convention, so the stricter
  // liability rule can only ever be added, never dropped, as it arrives.
  const signConvention = account ? getAccountKindBehaviour(account.kind).signConvention : 'asset';
  const resolver = useMemo(
    () => standardSchemaResolver(checkpointFormSchema(signConvention)),
    [signConvention]
  );
  const form = useForm({ resolver, defaultValues: DEFAULT_CHECKPOINT_FORM_VALUES });

  const openDialog = () => {
    form.reset({ ...DEFAULT_CHECKPOINT_FORM_VALUES, asOf: today() });
    setIsDialogOpen(true);
  };

  const onSubmit = (values: CheckpointFormValues) => {
    if (!account) return;
    createMutation.mutate(toCreateBody(values, account), {
      onSuccess: () => setIsDialogOpen(false),
    });
  };

  return {
    isDialogOpen,
    setIsDialogOpen,
    openDialog,
    form,
    onSubmit,
    isSubmitting: createMutation.isPending,
    deleteCheckpoint: deleteMutation.mutate,
  };
}
