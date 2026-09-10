/**
 * Sub-hook: fetches templates and scopes, holding onto the last
 * successfully-loaded value while a refetch is in flight so
 * dependent memos/callbacks don't churn on transient `undefined`.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { scopesList, tagsList, templatesList } from '../../cerebrum-api';
import { unwrap } from '../../cerebrum-api-helpers';
import { ENGRAM_TYPE_LABELS, ENGRAM_TYPES } from './types';

import type { ScopeEntry, TagEntry, TemplateSummary } from './types';

const TYPE_OPTIONS = ENGRAM_TYPES.map((typeName) => ({
  value: typeName,
  label: ENGRAM_TYPE_LABELS[typeName],
}));

/**
 * Hold onto the last defined value of `raw` across renders, so a transient
 * `undefined` (e.g. while a query refetches) doesn't flash callers back to
 * `fallback`. Uses React's "adjust state during render" pattern rather than
 * an effect, so the sticky value is available on the very render it changes.
 */
function useSticky<T>(raw: T | undefined, fallback: T): T {
  const [prevRaw, setPrevRaw] = useState(raw);
  const [sticky, setSticky] = useState(fallback);
  if (raw !== prevRaw) {
    setPrevRaw(raw);
    if (raw !== undefined) setSticky(raw);
  }
  return sticky;
}

export function useTemplateAndScopeData() {
  const templatesQuery = useQuery({
    queryKey: ['cerebrum', 'templates', 'list'],
    queryFn: async () => unwrap(await templatesList()),
  });
  const scopesQuery = useQuery({
    queryKey: ['cerebrum', 'scopes', 'list'],
    queryFn: async () => unwrap(await scopesList({ query: {} })),
  });
  const tagsQuery = useQuery({
    queryKey: ['cerebrum', 'tags', 'list'],
    queryFn: async () => unwrap(await tagsList()),
  });

  const templates = useSticky<TemplateSummary[]>(templatesQuery.data?.templates, []);
  const knownScopes = useSticky<ScopeEntry[]>(scopesQuery.data?.scopes, []);
  const knownTags = useSticky<TagEntry[]>(tagsQuery.data?.tags, []);

  const scopeSuggestions = useMemo(
    () =>
      knownScopes.map((s) => ({
        label: `${s.scope} · ${s.count} engram${s.count === 1 ? '' : 's'}`,
        value: s.scope,
      })),
    [knownScopes]
  );

  const tagSuggestions = useMemo(
    () =>
      knownTags.map((t) => ({
        label: `${t.tag} · ${t.count}`,
        value: t.tag,
      })),
    [knownTags]
  );

  return {
    templates,
    knownScopes,
    knownTags,
    typeOptions: TYPE_OPTIONS,
    scopeSuggestions,
    tagSuggestions,
    templatesLoading: templatesQuery.isLoading,
    scopesLoading: scopesQuery.isLoading,
    tagsLoading: tagsQuery.isLoading,
  };
}
