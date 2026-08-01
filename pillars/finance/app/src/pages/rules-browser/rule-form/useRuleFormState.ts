import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap as unwrapContacts } from '../../../contacts-api-helpers.js';
import { entitiesList } from '../../../contacts-api/index.js';
import { unwrap } from '../../../finance-api-helpers.js';
import { correctionsCreateOrUpdate, correctionsUpdate } from '../../../finance-api/index.js';
import { DEFAULT_RULE_FORM_VALUES, type RuleFormValues, RuleFormSchema } from './types';

import type { Correction, MatchType } from '../types';

interface UseRuleFormStateOptions {
  onClose: () => void;
}

/** The contacts pillar clamps `limit` to 200; asking for more just reads as a lie. */
const ENTITIES_LIST_INPUT = { limit: 200 } as const;

interface CreateRulePayload {
  descriptionPattern: string;
  matchType: MatchType;
  entityId: string | null;
  entityName: string | null;
  tags: string[];
  priority: number;
}

interface UpdateRulePayload {
  descriptionPattern: string;
  matchType: MatchType;
  entityId: string | null;
  entityName: string | null;
  tags: string[];
  priority: number;
  isActive: boolean;
}

interface UpdateRuleInput {
  id: string;
  data: UpdateRulePayload;
}

function useRuleMutations(onClose: () => void) {
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async (vars: CreateRulePayload) =>
      unwrap(await correctionsCreateOrUpdate({ body: vars })),
    onSuccess: () => {
      toast.success('Rule saved');
      void queryClient.invalidateQueries({ queryKey: ['finance', 'corrections', 'list'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const updateMutation = useMutation({
    mutationFn: async (vars: UpdateRuleInput) =>
      unwrap(await correctionsUpdate({ path: { id: vars.id }, body: vars.data })),
    onSuccess: () => {
      toast.success('Rule updated');
      void queryClient.invalidateQueries({ queryKey: ['finance', 'corrections', 'list'] });
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return { createMutation, updateMutation };
}

interface SubmitDeps {
  editingRule: Correction | null;
  createMutation: ReturnType<typeof useRuleMutations>['createMutation'];
  updateMutation: ReturnType<typeof useRuleMutations>['updateMutation'];
  /** Resolves the picked entity's name so the stored label can never diverge from the id. */
  entityNameOf: (entityId: string | null) => string | null;
}

interface RuleEntity {
  entityId: string | null;
  entityName: string | null;
}

/**
 * The `(entityId, entityName)` pair to store, or `null` when the picked id
 * cannot be named.
 *
 * The picker's option list is one capped page, so `entityNameOf` can come back
 * empty for an id that is perfectly valid — while the list loads, or for an
 * entity beyond the page. Writing that `null` through would strip the label off
 * a live id and recreate the divergence this field exists to prevent, so an
 * unchanged id keeps whatever label the rule already carries, and a newly
 * picked id that cannot be named blocks the write instead of guessing.
 */
function resolveRuleEntity(
  pickedId: string | null,
  editingRule: Correction | null,
  entityNameOf: (entityId: string | null) => string | null
): RuleEntity | null {
  if (!pickedId) return { entityId: null, entityName: null };
  const resolved = entityNameOf(pickedId);
  if (resolved) return { entityId: pickedId, entityName: resolved };
  if (editingRule?.entityId === pickedId) {
    return { entityId: pickedId, entityName: editingRule.entityName };
  }
  return null;
}

function buildSubmit({ editingRule, createMutation, updateMutation, entityNameOf }: SubmitDeps) {
  return (values: RuleFormValues) => {
    const entity = resolveRuleEntity(values.entityId ?? null, editingRule, entityNameOf);
    if (!entity) {
      toast.error('Could not resolve the selected entity — reopen the picker and choose it again.');
      return;
    }
    if (editingRule) {
      updateMutation.mutate({
        id: editingRule.id,
        data: {
          descriptionPattern: values.descriptionPattern,
          matchType: values.matchType,
          ...entity,
          tags: values.tags,
          priority: values.priority,
          isActive: values.isActive,
        },
      });
      return;
    }
    createMutation.mutate({
      descriptionPattern: values.descriptionPattern,
      matchType: values.matchType,
      ...entity,
      tags: values.tags,
      priority: values.priority,
    });
  };
}

/**
 * Hook owning the manual rule create/edit dialog form state.
 *
 * Mirrors `useEntitiesPage`:
 *   - `useForm` + standard-schema resolver + `DEFAULT_RULE_FORM_VALUES`
 *   - `form.reset(...)` on edit so prefilled values land in `register`d
 *     inputs (the TextInput safety pattern relies on uncontrolled inputs
 *     whose value is rewritten via the ref).
 *   - boolean `isActive` is managed via Controller in the dialog.
 *
 * The dialog supports both create and edit, backed by the finance REST
 * `corrections.createOrUpdate` / `corrections.update` operations; the entity
 * picker reads the contacts `entities.list` over the generated contacts REST
 * client. `isSubmitting` aggregates the two mutation `isPending` flags by hand.
 */
export function useRuleFormState({ onClose }: UseRuleFormStateOptions) {
  const [editingRule, setEditingRule] = useState<Correction | null>(null);
  const form = useForm<RuleFormValues>({
    // Zod 4 implements Standard Schema v1, so we use the generic
    // standard-schema resolver — the dedicated `zodResolver` overloads are
    // currently broken under Zod 4 (typeName/_def shape mismatch).
    resolver: standardSchemaResolver(RuleFormSchema),
    defaultValues: DEFAULT_RULE_FORM_VALUES,
  });
  const { createMutation, updateMutation } = useRuleMutations(onClose);
  const entitiesQuery = useQuery({
    queryKey: ['contacts', 'entities', 'list', ENTITIES_LIST_INPUT],
    queryFn: async () => unwrapContacts(await entitiesList({ query: ENTITIES_LIST_INPUT })),
  });
  const entities = (entitiesQuery.data?.data ?? []).map((e) => ({ id: e.id, name: e.name }));

  const handleAdd = useCallback(() => {
    setEditingRule(null);
    form.reset(DEFAULT_RULE_FORM_VALUES);
  }, [form]);

  const handleEdit = useCallback(
    (rule: Correction) => {
      setEditingRule(rule);
      form.reset({
        descriptionPattern: rule.descriptionPattern,
        matchType: rule.matchType,
        entityId: rule.entityId ?? null,
        tags: rule.tags,
        priority: rule.priority,
        isActive: rule.isActive,
      });
    },
    [form]
  );

  return {
    form,
    editingRule,
    entities,
    handleAdd,
    handleEdit,
    onSubmit: buildSubmit({
      editingRule,
      createMutation,
      updateMutation,
      entityNameOf: (entityId) => entities.find((e) => e.id === entityId)?.name ?? null,
    }),
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}
