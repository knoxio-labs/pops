/**
 * Context-tag select + debounced search input for `SubGraphHeader` —
 * split out to keep that file under the `max-lines` budget.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Select, type SelectOption, TextInput, useDebouncedValue } from '@pops/ui';

export function ContextTagSelect({
  contextTag,
  onContextTagChange,
  availableContextTags,
}: {
  contextTag: string | null;
  onContextTagChange: (tag: string | null) => void;
  availableContextTags: readonly string[];
}): React.ReactElement {
  const { t } = useTranslation('food');
  const options: SelectOption[] = [
    { value: '', label: t('data.substitutions.graph.contextAll') },
    ...availableContextTags.map((tag) => ({ value: tag, label: tag })),
  ];
  return (
    <Select
      label={t('data.substitutions.graph.contextLabel')}
      value={contextTag ?? ''}
      onChange={(e) => onContextTagChange(e.target.value === '' ? null : e.target.value)}
      options={options}
      containerClassName="w-44"
    />
  );
}

const SEARCH_DEBOUNCE_MS = 200;

export function DebouncedSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (search: string) => void;
}): React.ReactElement {
  const { t } = useTranslation('food');
  const [local, setLocal] = useState(value);
  // `userTyping` distinguishes a `local` change driven by user keystrokes
  // (which we want to debounce-emit) from a `local` change pushed in by
  // the parent (deep link, Clear-filters reset, browser back). Without
  // this flag, an externally-cleared URL would still receive a stale
  // debounce fire that re-pushes the previously-typed value.
  const userTyping = useRef(false);
  // Re-sync local from the URL-driven prop whenever it changes. The
  // setLocal + ref reset together ensure a stale debounce can't echo
  // a pre-clear value back into the URL. React bails on setLocal when
  // the value already matches, so an echo from our own debounce-emit
  // (parent processes onChange → re-emits same prop) is a no-op.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }
  useEffect(() => {
    userTyping.current = false;
  }, [value]);
  const debounced = useDebouncedValue(local, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    if (userTyping.current && debounced !== value) {
      userTyping.current = false;
      onChange(debounced);
    }
  }, [debounced, value, onChange]);
  return (
    <div className="flex-1">
      <TextInput
        type="search"
        size="sm"
        value={local}
        onChange={(e) => {
          userTyping.current = true;
          setLocal(e.target.value);
        }}
        placeholder={t('data.substitutions.graph.searchPlaceholder')}
      />
    </div>
  );
}
