/**
 * SuccessBurst — a one-shot celebration for a thing that has just finished.
 *
 * A disc pops in, a check wipes across it, two rings ripple out and a ring of
 * confetti flies off in the app's status and accent colours. The choreography
 * (durations, easing, delays) lives in `globals.css` as `--animate-success-*`
 * so the sequence reads in one place; this file only places the pieces.
 *
 * Plays once, on mount. Re-key it to play again.
 *
 * Under `prefers-reduced-motion` the disc and check render in their final
 * state and the rings and confetti are not rendered at all — the component
 * still says "done", it just does not dance about it.
 */
import { Check } from 'lucide-react';

import { cn } from '../lib/utils';

import type { ReactElement } from 'react';

/**
 * Twelve pieces on two radii, alternating dots and streaks, each streak turned
 * to point along its own flight path. Written out rather than computed: a
 * Tailwind class assembled at runtime is a class Tailwind never generates.
 * The `success-confetti` keyframe flies each piece from the centre to
 * wherever its translate utilities put it.
 */
const CONFETTI: readonly string[] = [
  'size-2 rounded-full bg-success translate-x-5 -translate-y-17',
  'h-1 w-3 rounded-full rotate-135 bg-app-accent translate-x-10 -translate-y-10',
  'size-2 rounded-full bg-warning translate-x-17 -translate-y-5',
  'h-1 w-3 rounded-full rotate-15 bg-info translate-x-14 translate-y-4',
  'size-2 rounded-full bg-primary translate-x-13 translate-y-13',
  'h-1 w-3 rounded-full rotate-75 bg-success translate-x-4 translate-y-14',
  'size-2 rounded-full bg-success -translate-x-5 translate-y-17',
  'h-1 w-3 rounded-full rotate-135 bg-app-accent -translate-x-10 translate-y-10',
  'size-2 rounded-full bg-warning -translate-x-17 translate-y-5',
  'h-1 w-3 rounded-full rotate-15 bg-info -translate-x-14 -translate-y-4',
  'size-2 rounded-full bg-primary -translate-x-13 -translate-y-13',
  'h-1 w-3 rounded-full rotate-75 bg-success -translate-x-4 -translate-y-14',
];

/** Centres an absolutely positioned piece of fixed size inside the stage. */
const CENTRED = 'absolute inset-0 m-auto';

export interface SuccessBurstProps {
  /** Accessible name — what just succeeded. The animation itself says nothing. */
  label: string;
  className?: string;
}

export function SuccessBurst({ label, className }: SuccessBurstProps): ReactElement {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('relative grid size-40 shrink-0 place-items-center', className)}
    >
      <span
        aria-hidden="true"
        className={cn(CENTRED, 'size-24 rounded-full bg-success/15 blur-xl')}
      />
      <span
        aria-hidden="true"
        data-testid="success-burst-ring"
        className={cn(
          CENTRED,
          'size-20 rounded-full border-2 border-success animate-success-ring motion-reduce:hidden'
        )}
      />
      <span
        aria-hidden="true"
        data-testid="success-burst-ring"
        className={cn(
          CENTRED,
          'size-20 rounded-full border border-success/60 animate-success-ring-late motion-reduce:hidden'
        )}
      />
      {CONFETTI.map((piece) => (
        <span
          key={piece}
          aria-hidden="true"
          data-testid="success-burst-confetti"
          className={cn(CENTRED, piece, 'animate-success-confetti motion-reduce:hidden')}
        />
      ))}
      <span
        aria-hidden="true"
        className="relative grid size-20 place-items-center rounded-full bg-success text-success-foreground shadow-lg animate-success-pop motion-reduce:animate-none"
      >
        <Check
          className="size-10 animate-success-check motion-reduce:animate-none"
          strokeWidth={3}
        />
      </span>
    </div>
  );
}
