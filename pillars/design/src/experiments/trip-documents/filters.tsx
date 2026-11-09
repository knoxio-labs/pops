import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

import { Button, ComboboxSelect, TextInput } from '@pops/ui';

import { useTripDocuments } from './context';

import type { TripDocumentFilters, TripDocumentsState } from './model';

function filterFields(state: TripDocumentsState) {
  return [
    {
      key: 'source',
      label: 'Source availability',
      options: [
        { value: 'all', label: 'All sources' },
        { value: 'available', label: 'Available' },
        { value: 'unavailable', label: 'Unavailable' },
        { value: 'unknown', label: 'Unknown source' },
      ],
    },
    {
      key: 'offline',
      label: 'Offline availability',
      options: [
        { value: 'all', label: 'All offline states' },
        { value: 'ready', label: 'Offline ready' },
        { value: 'not-downloaded', label: 'Not downloaded' },
        { value: 'stale', label: 'Stale' },
        { value: 'failed', label: 'Failed' },
        { value: 'unknown', label: 'No offline record' },
      ],
    },
    {
      key: 'mimeType',
      label: 'File type',
      options: [
        { value: '', label: 'All file types' },
        ...Array.from(new Set(state.linking.documents.map((item) => item.mimeType))).map(
          (value) => ({ value, label: value })
        ),
      ],
    },
  ] as const;
}

type FilterProps = { filters: TripDocumentFilters; onChange: (next: TripDocumentFilters) => void };

/** Search the source catalogue and disclose independent availability filters. */
export function DocumentFilters({ filters, onChange }: FilterProps) {
  const [open, setOpen] = useState(false);
  const { state } = useTripDocuments();
  const fields = filterFields(state);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <TextInput
          className="min-h-11"
          aria-label="Search documents"
          placeholder="Search documents"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.currentTarget.value })}
        />
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
          <SlidersHorizontal className="size-4" />
          Filters
        </Button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2">
          {fields.map((field) => (
            <ComboboxSelect
              key={field.key}
              aria-label={field.label}
              value={filters[field.key]}
              options={[...field.options]}
              onChange={(value) => {
                if (typeof value === 'string') onChange({ ...filters, [field.key]: value });
              }}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {fields
          .filter((field) => filters[field.key] !== (field.key === 'mimeType' ? '' : 'all'))
          .map((field) => (
            <Button
              key={field.key}
              variant="secondary"
              className="text-xs"
              aria-label={`Clear ${field.label}`}
              onClick={() =>
                onChange({ ...filters, [field.key]: field.key === 'mimeType' ? '' : 'all' })
              }
            >
              {field.options.find((option) => option.value === filters[field.key])?.label}
              <X className="size-3" />
            </Button>
          ))}
      </div>
    </div>
  );
}
