import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import {
  institutionsDelete,
  institutionsList,
  institutionsMerge,
  institutionsUpdate,
} from '../../finance-api/index.js';
import { type Institution, InstitutionFormSchema, type InstitutionFormValues } from './types';

const INSTITUTIONS_KEY = ['finance', 'institutions', 'list'];

const DEFAULT_FORM_VALUES: InstitutionFormValues = { name: '', colour: '#6b7280' };

function useInstitutionMutations(args: {
  setEditing: (i: Institution | null) => void;
  setDeletingId: (id: string | null) => void;
  setMerging: (i: Institution | null) => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: INSTITUTIONS_KEY });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; data: InstitutionFormValues }) =>
      unwrap(await institutionsUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      toast.success('Institution updated');
      args.setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => unwrap(await institutionsDelete({ path: { id } })),
    onSuccess: () => {
      toast.success('Institution deleted');
      args.setDeletingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const mergeMutation = useMutation({
    mutationFn: async (input: { id: string; targetId: string }) =>
      unwrap(
        await institutionsMerge({ path: { id: input.id }, body: { targetId: input.targetId } })
      ),
    onSuccess: () => {
      toast.success('Institutions merged');
      args.setMerging(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  return { updateMutation, deleteMutation, mergeMutation };
}

/**
 * List + edit + delete state for the institutions section of the settings
 * page. Creation stays out of scope (POPS-2810) — institutions are minted
 * inline from the account form's `InstitutionSelect`.
 */
export function useInstitutionsSettings() {
  const [editing, setEditing] = useState<Institution | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [merging, setMerging] = useState<Institution | null>(null);

  const query = useQuery({
    queryKey: INSTITUTIONS_KEY,
    queryFn: async () => unwrap(await institutionsList()),
  });

  const { updateMutation, deleteMutation, mergeMutation } = useInstitutionMutations({
    setEditing,
    setDeletingId,
    setMerging,
  });

  const form = useForm<InstitutionFormValues>({
    resolver: standardSchemaResolver(InstitutionFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const handleEdit = (institution: Institution) => {
    setEditing(institution);
    form.reset({ name: institution.name, colour: institution.colour });
  };

  const onSubmit = (values: InstitutionFormValues) => {
    if (!editing) return;
    updateMutation.mutate({ id: editing.id, data: values });
  };

  const onMerge = (targetId: string) => {
    if (!merging) return;
    mergeMutation.mutate({ id: merging.id, targetId });
  };

  return {
    query,
    form,
    editing,
    setEditing,
    deletingId,
    setDeletingId,
    merging,
    setMerging,
    handleEdit,
    onSubmit,
    onMerge,
    updateMutation,
    deleteMutation,
    mergeMutation,
  };
}
