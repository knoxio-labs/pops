/**
 * The input row's left side during an argument step: the command waiting
 * for its target, as a chip, so "Move" then "Garage" reads as one sentence.
 * Backspace on an empty query removes the chip.
 */
import { ChevronRight } from 'lucide-react';

import type { PaletteStep } from './palette-groups';

/** The step chips, outermost first. */
export function PaletteArgumentSteps({
  steps,
  subject,
}: {
  steps: readonly PaletteStep[];
  subject?: string;
}) {
  if (steps.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label="Command waiting for a choice">
      {steps.map((step) => (
        <span
          key={step.commandId}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-app-accent/40 bg-app-accent/10 px-2 text-xs font-medium text-foreground"
        >
          {step.label}
          {subject ? <span className="font-normal text-muted-foreground">{subject}</span> : null}
        </span>
      ))}
      <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
    </span>
  );
}

/** Placeholder text for the input: what to type now. */
export function palettePlaceholder(
  step: PaletteStep | null,
  scope: 'inventory' | 'purchases'
): string {
  if (step?.argument === 'placement') return 'Where to? Search places and containers';
  if (step?.argument === 'type') return 'Which type?';
  if (step?.argument === 'lifecycle-reason') return 'Why? One line, kept in history';
  return scope === 'purchases'
    ? 'Search purchases by merchant, item or order number'
    : 'Search items, places and codes, or type a command';
}
