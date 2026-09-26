import { ChevronRight } from 'lucide-react';

import { cn } from '../../lib/utils';
import { KeyCombo } from '../Kbd';

import type { ReactElement } from 'react';

import type { PaletteScopeOption, PaletteStep } from './types';

/** Renders the argument steps and the optional subject in the palette input row. */
export function PaletteArgumentSteps({
  steps,
  subject,
}: {
  steps: readonly PaletteStep[];
  subject?: string;
}): ReactElement | null {
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

/** Renders the scope chips and the Tab hint when more than one scope exists. */
export function ScopeChips({
  scopes,
  activeScope,
  locked,
}: {
  scopes: readonly PaletteScopeOption[];
  activeScope: string;
  locked: boolean;
}): ReactElement | null {
  if (scopes.length < 2) return null;
  return (
    <span
      className={cn('flex shrink-0 items-center gap-1', locked && 'opacity-50')}
      aria-label={`Searching ${scopes.find((scope) => scope.id === activeScope)?.label ?? activeScope}`}
    >
      {scopes.map((scope) => (
        <span
          key={scope.id}
          className={cn(
            'inline-flex h-6 items-center rounded-md px-2 text-xs font-medium',
            activeScope === scope.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground'
          )}
        >
          {scope.label}
        </span>
      ))}
      <KeyCombo sequence={['Tab']} className="ml-1" />
    </span>
  );
}

/** Renders the ready-state empty result message and its available keyboard hint. */
export function Empty({
  query,
  scope,
  nextScope,
  step,
}: {
  query: string;
  scope: PaletteScopeOption;
  nextScope?: PaletteScopeOption;
  step: PaletteStep | null;
}): ReactElement {
  let hint: ReactElement | null = null;
  if (step !== null) {
    hint = (
      <>
        Press <KeyCombo sequence={['Backspace']} /> on an empty query to go back.
      </>
    );
  } else if (nextScope !== undefined) {
    hint = (
      <>
        Press <KeyCombo sequence={['Tab']} /> to search {nextScope.label}.
      </>
    );
  }
  return (
    <div className="px-4 py-8 text-center text-sm">
      <p className="font-medium">
        {step === null
          ? `Nothing in ${scope.label} matches “${query.trim()}”.`
          : `No choice for ${step.label} matches “${query.trim()}”.`}
      </p>
      <p className="mt-1 text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Renders the palette's keyboard-help footer. */
export function Footer(): ReactElement {
  const hint = (sequence: string[], text: string) => (
    <span className="inline-flex items-center gap-1">
      <KeyCombo sequence={sequence} /> {text}
    </span>
  );
  return (
    <footer className="flex items-center gap-4 border-t px-3 py-2 text-2xs text-muted-foreground">
      {hint(['Enter'], 'to open or run')}
      {hint(['Mod+Enter'], 'to open beside')}
      {hint(['Backspace'], 'to step back')}
      <span className="ml-auto">{hint(['Escape'], 'to close')}</span>
    </footer>
  );
}
