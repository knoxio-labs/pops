import type { ReactElement } from 'react';

export interface FactProps {
  label: string;
  value: string | null;
  /** What an absent value means here — a receipt was not read, an order does not record it. */
  missingLabel: string;
}

/**
 * One labelled value inside a `<dl>`, saying what its absence means rather than
 * rendering a blank.
 *
 * A blank cell reads as a rendering fault. The caller supplies the wording
 * because the same emptiness means different things on different surfaces: the
 * model could not read a figure, or the merchant never sent one.
 */
export function Fact({ label, value, missingLabel }: FactProps): ReactElement {
  const missing = value === null || value.trim() === '';
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={missing ? 'text-muted-foreground text-sm italic' : 'text-sm'}>
        {missing ? missingLabel : value}
      </dd>
    </div>
  );
}
