import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, TextInput } from '@pops/ui';

import type { ChangeEvent } from 'react';

import type { SearchMode } from './types';

interface SearchInputProps {
  query: string;
  mode: SearchMode;
  onQueryChange: (q: string) => void;
  onModeChange: (mode: SearchMode) => void;
}

export function SearchInput({ query, mode, onQueryChange, onModeChange }: SearchInputProps) {
  const { t } = useTranslation('media');
  return (
    <>
      <TextInput
        type="search"
        placeholder={t('search.placeholder')}
        value={query}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onQueryChange(e.target.value)}
        prefix={<Search className="h-4 w-4" />}
        clearable
        onClear={() => onQueryChange('')}
        autoFocus
      />

      <Tabs value={mode} onValueChange={(v: string) => onModeChange(v as SearchMode)}>
        <TabsList>
          <TabsTrigger value="both">{t('common.both')}</TabsTrigger>
          <TabsTrigger value="movies">{t('common.movies')}</TabsTrigger>
          <TabsTrigger value="tv">{t('common.tvShows')}</TabsTrigger>
        </TabsList>
      </Tabs>
    </>
  );
}
