import { Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import type { HomeFilter } from './model';

interface Props {
  query: string;
  setQuery: (query: string) => void;
  bucket: HomeFilter;
  setBucket: (bucket: HomeFilter) => void;
  create: () => void;
}
/** Approved home search and derived-date filter never write a persisted trip status. */
export function HomeToolbar({ query, setQuery, bucket, setBucket, create }: Props) {
  const { t } = useTranslation('trips');
  const values: HomeFilter[] = ['all', 'current', 'upcoming', 'other', 'past'];
  return (
    <div className="flex flex-wrap items-end gap-3">
      <TextInput
        aria-label={t('search')}
        placeholder={t('search')}
        className="text-sm"
        containerClassName="min-h-11 min-w-40 flex-1"
        prefix={<Search className="size-4" aria-hidden />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <ComboboxSelect
        aria-label={t('view')}
        className="min-h-11 w-40 text-sm"
        value={bucket}
        options={values.map((value) => ({
          value,
          label: t(value === 'all' ? 'allTrips' : `homeRows.${value}`),
        }))}
        onChange={(value) => {
          const found = values.find((item) => item === value);
          if (found) setBucket(found);
        }}
      />
      <Button
        className="min-h-11 bg-app-accent text-app-accent-foreground hover:bg-app-accent/90"
        onClick={create}
      >
        <Plus className="size-4" aria-hidden />
        {t('newTrip')}
      </Button>
    </div>
  );
}
