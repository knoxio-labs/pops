import { TextInput } from '@pops/ui';

import { useStay } from './context';

type StayTextField =
  | 'name'
  | 'from'
  | 'to'
  | 'checkIn'
  | 'checkOut'
  | 'timeZone'
  | 'address'
  | 'reference';

/** Commit explicit text and local date fields on blur; unchanged values do not add undo steps. */
export function StayField({
  field,
  label,
  type = 'text',
}: {
  field: StayTextField;
  label: string;
  type?: 'text' | 'date' | 'time';
}) {
  const { state, change } = useStay();
  return (
    <TextInput
      key={`${field}-${state[field]}`}
      type={type}
      label={field === 'name' ? undefined : label}
      aria-label={label}
      className={field === 'name' ? 'text-xl font-semibold' : undefined}
      variant="ghost"
      containerClassName="bg-transparent"
      defaultValue={state[field]}
      onBlur={(event) => {
        if (event.currentTarget.value !== state[field])
          change({ ...state, [field]: event.currentTarget.value });
      }}
    />
  );
}
