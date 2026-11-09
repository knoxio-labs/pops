import { ComboboxSelect } from '@pops/ui';

import { ideaKinds, ideaPurposes } from '../trip-place-detail/fixture';
import { captureKinds } from '../trip-quick-capture/model';
import { useExplore } from './context';

/** Uses the existing idea and capture kind catalogues without inferring classifications. */
export const exploreKindOptions = [
  ...new Map(
    [...ideaKinds, ...captureKinds.map((kind) => ({ value: kind.id, label: kind.label }))].map(
      (kind) => [kind.value, kind]
    )
  ).values(),
];

/** Chooses an explicit source kind without deriving it from captured text. */
export function ExploreKind({
  value,
  change,
  all = false,
}: {
  value: string;
  change: (value: string) => void;
  all?: boolean;
}) {
  return (
    <ComboboxSelect
      aria-label={all ? 'Filter kind' : 'Kind'}
      value={value}
      options={
        all
          ? [{ value: '', label: 'All kinds' }, ...exploreKindOptions]
          : [{ value: '', label: 'Clear kind' }, ...exploreKindOptions]
      }
      placeholder={all ? 'All kinds' : 'Kind (optional)'}
      onChange={(next) => {
        if (typeof next === 'string') change(next);
      }}
    />
  );
}

/** Keeps an optional source location selection distinct from an unavailable existing reference. */
export function ExploreCity({
  value,
  change,
  filter = false,
  citiesOnly = false,
}: {
  value: string;
  change: (value: string) => void;
  filter?: boolean;
  citiesOnly?: boolean;
}) {
  const { state } = useExplore();
  const options = [
    { value: '', label: filter ? 'All locations' : 'No location' },
    ...state.cities
      .filter((city) => !citiesOnly || city.kind === 'city')
      .map((city) => ({ value: city.id, label: city.name })),
  ];
  if (value && !state.cities.some((city) => city.id === value))
    options.push({ value, label: 'Location unavailable' });
  return (
    <ComboboxSelect
      aria-label={filter ? 'Filter location' : 'Location'}
      value={value}
      options={options}
      placeholder={filter ? 'All locations' : 'No location'}
      onChange={(next) => {
        if (typeof next === 'string') change(next);
      }}
    />
  );
}

/** Resolves the explicit source purpose without inventing a label for unselected values. */
export function explorePurposeLabel(value: string) {
  return ideaPurposes.find((purpose) => purpose.value === value)?.label ?? value;
}
