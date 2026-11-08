import { Search } from 'lucide-react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import { useDirectory } from './context';
import { directoryCities, directoryKinds } from './model';

/** Search source facts and combine optional type, city and origin filters without inventing missing facts. */
export function DirectoryFilters() {
  const { state, change } = useDirectory();
  const filters = [
    {
      key: 'kind',
      label: 'Type',
      all: 'All types',
      options: directoryKinds.map((item) => ({ value: item.kind, label: item.label })),
    },
    {
      key: 'city',
      label: 'City',
      all: 'All cities',
      options: directoryCities(state).map((city) => ({ value: city, label: city })),
    },
    {
      key: 'origin',
      label: 'Source',
      all: 'All sources',
      options: [
        { value: 'Contacts', label: 'Contacts' },
        { value: 'Finance', label: 'Finance' },
      ],
    },
  ] as const;
  return (
    <section aria-label="Contact search and filters" className="space-y-3">
      <TextInput
        aria-label="Search contacts"
        placeholder="Search names, aliases, email or city"
        prefix={<Search className="size-4" />}
        value={state.query}
        onChange={(event) => change({ ...state, query: event.currentTarget.value })}
      />
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <ComboboxSelect
            key={filter.key}
            aria-label={filter.label}
            value={state[filter.key]}
            placeholder={filter.all}
            options={[{ value: '', label: filter.all }, ...filter.options]}
            onChange={(value) => {
              if (typeof value === 'string') change({ ...state, [filter.key]: value });
            }}
          />
        ))}
        {(state.query || state.kind || state.city || state.origin) && (
          <Button
            variant="ghost"
            onClick={() => change({ ...state, query: '', kind: '', city: '', origin: '' })}
          >
            Clear filters
          </Button>
        )}
      </div>
    </section>
  );
}
