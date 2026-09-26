import { useCallback, useEffect, useMemo, useState } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import { codesSuggest } from '../../inventory-api/index.js';
import { useWebSearch } from '../../inventory-web/useWebSearch.js';
import { codeEntry } from './code-assist';

import type { Dispatch } from 'react';

import type { CodeEntry } from './code-assist';
import type { DraftAction } from './form-draft';

/** Inputs for the server-backed code suggestion and availability assistant. */
export interface UseCodeAssistOptions {
  readonly entry: CodeEntry;
  readonly name: string;
  readonly typeKey: string | null;
  readonly typeLabel: string | null;
  readonly online: boolean;
  readonly editingId: string | null;
  readonly dispatch: Dispatch<DraftAction>;
}

/** The code controls exposed to the item form. */
export interface CodeAssistApi {
  readonly suggest: () => void;
  readonly type: (value: string) => void;
  readonly checking: boolean;
}

function useCodeCheck({
  dispatch,
  editingId,
  entry,
  searchItems,
  searchStatus,
  typedCode,
}: {
  readonly dispatch: Dispatch<DraftAction>;
  readonly editingId: string | null;
  readonly entry: CodeEntry;
  readonly searchItems: readonly { id: string; name: string; code: string | null }[];
  readonly searchStatus: ReturnType<typeof useWebSearch>['status'];
  readonly typedCode: string;
}): void {
  useEffect(() => {
    if (entry.status !== 'checking' || typedCode.trim() === '') return;
    if (searchStatus === 'pending' || searchStatus === 'idle') return;
    if (searchStatus === 'error') {
      dispatch({ type: 'code', action: { type: 'unavailable' } });
      return;
    }
    const lower = typedCode.trim().toLocaleLowerCase();
    const holder = searchItems.find(
      (item) => item.code?.trim().toLocaleLowerCase() === lower && item.id !== editingId
    );
    dispatch({
      type: 'code',
      action: {
        type: 'checked',
        taken: holder !== undefined,
        freeCode: holder === undefined ? typedCode.trim() : null,
        holder: holder === undefined ? null : { id: holder.id, name: holder.name },
      },
    });
  }, [dispatch, editingId, entry.status, searchItems, searchStatus, typedCode]);
}

function useCodeSuggestion({
  dispatch,
  name,
  online,
  typeKey,
}: Pick<UseCodeAssistOptions, 'dispatch' | 'name' | 'online' | 'typeKey'>): () => void {
  return useCallback((): void => {
    if (!online) {
      dispatch({ type: 'code', action: { type: 'offline' } });
      return;
    }
    if (name.trim() === '') return;
    dispatch({ type: 'code', action: { type: 'suggest' } });
    void codesSuggest({
      body: {
        name: name.trim(),
        ...(typeKey === null ? {} : { typeKey }),
      },
    })
      .then((result) => {
        const response = unwrap(result);
        dispatch({
          type: 'code',
          action: { type: 'suggested', suggestion: response.suggestions[0] ?? null },
        });
      })
      .catch(() => {
        dispatch({ type: 'code', action: { type: 'unavailable' } });
      });
  }, [dispatch, name, online, typeKey]);
}

/** Provides suggestion, typed-code checking and offline behaviour for a form. */
export function useCodeAssist(options: UseCodeAssistOptions): CodeAssistApi {
  const { dispatch, editingId, entry, name, online, typeKey } = options;
  const [typedCode, setTypedCode] = useState('');
  const search = useWebSearch({ q: typedCode, typeKey: typeKey ?? undefined, limit: 20 });
  const { exact, items } = search.results;
  const searchItems = useMemo(
    () => [exact, ...items.map((hit) => hit.item)].filter((item) => item !== null),
    [exact, items]
  );
  useCodeCheck({
    dispatch,
    editingId,
    entry,
    searchItems,
    searchStatus: search.status,
    typedCode,
  });
  const suggest = useCodeSuggestion({ dispatch, name, online, typeKey });

  const type = useCallback(
    (value: string): void => {
      setTypedCode(value);
      dispatch({ type: 'code', action: { type: 'typed', value } });
    },
    [dispatch]
  );

  return { suggest, type, checking: entry.status === 'checking' };
}

/** Creates a blank entry for consumers that need a stable initial value. */
export function emptyCodeEntry(): CodeEntry {
  return codeEntry();
}
