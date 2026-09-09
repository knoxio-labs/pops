import { Label } from '@pops/ui';

/**
 * Small form controls shared by the fridge modals — keeps the modal
 * bodies under the lint-enforced `max-lines-per-function` budget.
 */
import type { ReactElement, ReactNode } from 'react';

export function FieldRow({
  label,
  children,
  grouped = false,
}: {
  label: string;
  children: ReactNode;
  /**
   * Renders a `<fieldset>`/`<legend>` instead of a `<label>`. A grouped
   * control (a radio group) carries its own labels, and nesting those inside
   * this component's `<label>` is invalid HTML that misroutes clicks to the
   * outer label's control.
   */
  grouped?: boolean;
}): ReactElement {
  if (grouped) {
    return (
      <fieldset className="block space-y-1 text-xs">
        <legend className="text-muted-foreground">{label}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <Label className="block space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}

export function FormError({ message }: { message: string | null }): ReactElement | null {
  if (message === null) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function toIsoFromDateInput(yyyyMmDd: string): string | undefined {
  if (yyyyMmDd.length === 0) return undefined;
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}
