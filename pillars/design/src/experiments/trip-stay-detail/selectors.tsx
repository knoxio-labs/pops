import { ComboboxSelect } from '@pops/ui';

import { useStay } from './context';

import type { StayState } from './model';

const kinds: { value: StayState['kind']; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'friend', label: 'Friend' },
  { value: 'family', label: 'Family' },
  { value: 'other', label: 'Other' },
];
const statuses: { value: StayState['status']; label: string }[] = [
  { value: 'Considering', label: 'Considering' },
  { value: 'Agreed', label: 'Agreed' },
  { value: 'Reserved', label: 'Reserved' },
  { value: 'Purchased', label: 'Purchased' },
];

/** Accommodation type and agreement state remain independent, explicit user selections. */
export function StaySelectors() {
  const { state, change } = useStay();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ComboboxSelect
        aria-label="Stay type"
        options={kinds}
        value={state.kind}
        variant="ghost"
        onChange={(value) => {
          const selected = kinds.find((kind) => kind.value === value);
          if (selected && selected.value !== state.kind) change({ ...state, kind: selected.value });
        }}
      />
      <ComboboxSelect
        aria-label="Stay status"
        options={statuses}
        value={state.status}
        variant={state.status === 'Purchased' ? 'outline' : 'ghost'}
        onChange={(value) => {
          const selected = statuses.find((status) => status.value === value);
          if (selected && selected.value !== state.status)
            change({ ...state, status: selected.value });
        }}
      />
    </div>
  );
}
