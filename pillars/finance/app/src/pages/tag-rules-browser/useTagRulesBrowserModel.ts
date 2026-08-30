import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import {
  tagRulesApplyExisting,
  tagRulesDelete,
  tagRulesDisable,
  tagRulesList,
} from '../../finance-api/index.js';
import { useAllEntities } from '../../lib/useAllEntities';

import type { MatchType, TagRule } from './types';

export const PAGE_SIZE = 50;
interface TagRulesListResult {
  data: TagRule[];
  pagination: { total: number; limit: number; offset: number };
}

function parseMatchType(value: string): MatchType | undefined {
  return value === 'exact' || value === 'contains' || value === 'regex' ? value : undefined;
}

function parseIsActive(value: string): 'true' | 'false' | undefined {
  if (value === 'true' || value === 'false') return value;
  return undefined;
}

interface FilterState {
  matchType: string;
  setMatchType: (v: string) => void;
  isActive: string;
  setIsActive: (v: string) => void;
  minConfidence: string;
  setMinConfidence: (v: string) => void;
  offset: number;
  setOffset: (next: number | ((prev: number) => number)) => void;
}

function useFilterState(): FilterState {
  const [matchType, setMatchType] = useState('');
  const [isActive, setIsActive] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [offset, setOffsetState] = useState(0);
  const setOffset = useCallback((next: number | ((prev: number) => number)) => {
    setOffsetState((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);
  return {
    matchType,
    setMatchType,
    isActive,
    setIsActive,
    minConfidence,
    setMinConfidence,
    offset,
    setOffset,
  };
}

function useTagRulesListQuery(filters: FilterState) {
  const query = {
    matchType: parseMatchType(filters.matchType),
    isActive: parseIsActive(filters.isActive),
    minConfidence: filters.minConfidence ? parseFloat(filters.minConfidence) : undefined,
    limit: PAGE_SIZE,
    offset: filters.offset,
  };
  return useQuery({
    queryKey: ['finance', 'tagRules', 'list', query],
    queryFn: async (): Promise<TagRulesListResult> => unwrap(await tagRulesList({ query })),
  });
}

/**
 * A delete/disable (or a filter change that shrinks the result set) can leave
 * the current offset past the end of the new total. Clamp back to the new
 * last page instead of rendering a stranded empty page (mirrors the
 * corrections browser's CF084/#3670 fix).
 */
function useOffsetClamp(
  pagination: TagRulesListResult['pagination'] | undefined,
  offset: number,
  setOffset: FilterState['setOffset']
) {
  useEffect(() => {
    if (!pagination) return;
    if (pagination.total > 0 && pagination.total <= offset) {
      const lastValidOffset = Math.floor((pagination.total - 1) / PAGE_SIZE) * PAGE_SIZE;
      setOffset(lastValidOffset);
    } else if (pagination.total === 0 && offset > 0) {
      setOffset(0);
    }
  }, [pagination, offset, setOffset]);
}

function useDeleteFlow() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => unwrap(await tagRulesDelete({ path: { id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules', 'list'] });
      toast.success('Tag rule deleted');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    deleteMutation.mutate(deleteId);
  }, [deleteId, deleteMutation]);
  return { deleteId, setDeleteId, deleteMutation, handleDelete };
}

function useDisableFlow() {
  const queryClient = useQueryClient();
  const disableMutation = useMutation({
    mutationFn: async (id: string) => unwrap(await tagRulesDisable({ path: { id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules', 'list'] });
      toast.success('Tag rule disabled');
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDisable = useCallback((id: string) => disableMutation.mutate(id), [disableMutation]);
  return { disableMutation, handleDisable };
}

/**
 * Retroactive apply (#3660): merges a rule's tags into every existing
 * matching transaction it hasn't already tagged. A direct, real (non-dryRun)
 * apply — the browser doesn't offer a preview step since the operation is
 * additive-only and skips manual overrides, so there is nothing destructive
 * to confirm.
 */
function useApplyExistingFlow() {
  const queryClient = useQueryClient();
  const applyExistingMutation = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await tagRulesApplyExisting({ path: { id }, body: {} })),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['finance', 'tagRules', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['finance', 'transactions'] });
      const { updated } = result.data;
      toast.success(
        updated > 0
          ? `Tagged ${updated} existing transaction${updated === 1 ? '' : 's'}`
          : 'No existing transactions needed tagging'
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleApplyExisting = useCallback(
    (id: string) => applyExistingMutation.mutate(id),
    [applyExistingMutation]
  );
  return { applyExistingMutation, handleApplyExisting };
}

function useEntityNames() {
  const entitiesQuery = useAllEntities();
  return useMemo(
    () => new Map((entitiesQuery.data?.data ?? []).map((e) => [e.id, e.name])),
    [entitiesQuery.data]
  );
}

export function useTagRulesBrowserModel() {
  const filters = useFilterState();
  const del = useDeleteFlow();
  const disable = useDisableFlow();
  const applyExisting = useApplyExistingFlow();
  const [editingRule, setEditingRule] = useState<TagRule | null>(null);
  const entityNames = useEntityNames();

  const { data, isLoading, isError, refetch } = useTagRulesListQuery(filters);

  const tagRules: TagRule[] = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.total / PAGE_SIZE) : 1;
  const currentPage = Math.floor(filters.offset / PAGE_SIZE) + 1;

  const resetPage = useCallback(() => filters.setOffset(0), [filters]);

  useOffsetClamp(pagination, filters.offset, filters.setOffset);

  const handleEditRule = useCallback((rule: TagRule) => setEditingRule(rule), []);
  const closeEditDialog = useCallback(() => setEditingRule(null), []);

  return {
    matchType: filters.matchType,
    setMatchType: filters.setMatchType,
    isActive: filters.isActive,
    setIsActive: filters.setIsActive,
    minConfidence: filters.minConfidence,
    setMinConfidence: filters.setMinConfidence,
    offset: filters.offset,
    setOffset: filters.setOffset,
    resetPage,
    deleteId: del.deleteId,
    setDeleteId: del.setDeleteId,
    isLoading,
    isError,
    refetch,
    tagRules,
    entityNames,
    pagination,
    totalPages,
    currentPage,
    deleteMutation: del.deleteMutation,
    handleDelete: del.handleDelete,
    disableMutation: disable.disableMutation,
    handleDisable: disable.handleDisable,
    applyExistingMutation: applyExisting.applyExistingMutation,
    handleApplyExisting: applyExisting.handleApplyExisting,
    editingRule,
    handleEditRule,
    closeEditDialog,
  };
}
