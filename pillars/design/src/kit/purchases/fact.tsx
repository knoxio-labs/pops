export interface FactProps {
  label: string;
  value: string | null;
  /** What an absent value means here — a receipt was not read, an order does not record it. */
  missingLabel: string;
}

/**
 * One labelled value inside a `<dl>`, saying what its absence means rather
 * than rendering a blank.
 *
 * A blank cell reads as a rendering fault. The caller supplies the wording
 * because the same emptiness means different things on different surfaces:
 * the model could not read a figure, or the merchant never sent one.
 */
export function Fact({ label, value, missingLabel }: FactProps) {
  const missing = value === null || value.trim() === '';
  return (
    // `min-w-0` and the wrap: a grid item will not shrink below its content,
    // so an unbroken value — an entity id, a pops:// uri — pushes into the
    // next column instead of wrapping inside its own.
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={missing ? 'text-muted-foreground text-sm italic' : 'text-sm break-words'}>
        {missing ? missingLabel : value}
      </dd>
    </div>
  );
}
