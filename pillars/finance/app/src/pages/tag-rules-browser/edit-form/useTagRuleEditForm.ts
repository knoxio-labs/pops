import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap as unwrapContacts } from '../../../contacts-api-helpers.js';
import { entitiesList } from '../../../contacts-api/index.js';
import { unwrap } from '../../../finance-api-helpers.js';
import { tagRulesUpdate } from '../../../finance-api/index.js';
import { TagRuleEditFormSchema, type TagRuleEditFormValues } from './types';

import type { TagRule } from '../types';

const ENTITIES_LIST_INPUT = { limit: 500 } as const;

interface UseTagRuleEditFormOptions {
  rule: TagRule | null;
  onClose: () => void;
}

/**
 * Hook owning the Tag Rules browser's edit dialog form state.
 *
 * Mirrors `useRuleFormState` (the corrections rule-form hook): `useForm` +
 * standard-schema resolver, `form.reset(...)` when the target rule changes so
 * prefilled values land, and the entity picker reads the contacts
 * `entities.list` over the generated contacts REST client. The dialog only
 * ever edits an existing rule — there is no create path here (rules are
 * created via the import wizard's tag-rule proposal flow).
 */
export function useTagRuleEditForm({ rule, onClose }: UseTagRuleEditFormOptions) {
  const queryClient = useQueryClient();
  const form = useForm<TagRuleEditFormValues>({
    resolver: standardSchemaResolver(TagRuleEditFormSchema),
    defaultValues: { entityId: null, tags: [], confidence: 0.95, priority: 0, isActive: true },
  });

  useEffect(() => {
    if (!rule) return;
    form.reset({
      entityId: rule.entityId,
      tags: rule.tags,
      confidence: rule.confidence,
      priority: rule.priority,
      isActive: rule.isActive,
    });
  }, [rule, form]);

  const entitiesQuery = useQuery({
    queryKey: ['contacts', 'entities', 'list', ENTITIES_LIST_INPUT],
    queryFn: async () => unwrapContacts(await entitiesList({ query: ENTITIES_LIST_INPUT })),
  });
  const entities = (entitiesQuery.data?.data ?? []).map((e) => ({ id: e.id, name: e.name }));

  const updateMutation = useMutation({
    mutationFn: async (values: TagRuleEditFormValues) => {
      if (!rule) throw new Error('No tag rule selected for edit');
      return unwrap(await tagRulesUpdate({ path: { id: rule.id }, body: values }));
    },
    onSuccess: () => {
      toast.success('Tag rule updated');
      void queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules', 'list'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    form,
    entities,
    onSubmit: (values: TagRuleEditFormValues) => updateMutation.mutate(values),
    isSubmitting: updateMutation.isPending,
  };
}
