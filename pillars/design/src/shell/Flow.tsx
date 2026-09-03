import { Link, useNavigate } from 'react-router';

import { Button, cn } from '@pops/ui';

import type { ComponentType } from 'react';

import type { ScreenEntry } from '../registry';

function stepRender(
  step: ScreenEntry | undefined,
  state: string | null
): ComponentType | undefined {
  if (!step) return undefined;
  if (state && step.states?.[state]) return step.states[state];
  return step.component;
}

function Stepper({
  steps,
  index,
  hrefForStep,
}: {
  steps: ScreenEntry[];
  index: number;
  hrefForStep: (stepId: string) => string;
}) {
  return (
    <nav
      aria-label="Flow steps"
      className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3"
    >
      {steps.map((step, i) => (
        <Link
          key={step.id}
          to={hrefForStep(step.slug)}
          aria-current={i === index ? 'step' : undefined}
          className="flex items-center gap-2 text-sm"
        >
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
              i === index ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            {i + 1}
          </span>
          <span className={i === index ? 'font-medium' : 'text-muted-foreground'}>
            {step.title}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * A flow: a stepper plus the active step, with Back / Next moving between
 * step routes as in-frame transitions so viewport and theme survive the hop.
 */
export function Flow({
  flow,
  stepId,
  state,
  hrefForStep,
}: {
  flow: ScreenEntry;
  stepId: string;
  state: string | null;
  hrefForStep: (stepId: string) => string;
}) {
  const navigate = useNavigate();
  const steps = flow.steps ?? [];
  const index = Math.max(
    0,
    steps.findIndex((s) => s.slug === stepId)
  );
  const ActiveStep = stepRender(steps[index], state);
  if (!ActiveStep) return <p className="p-8 text-muted-foreground">Step not found.</p>;

  const prev = steps[index - 1];
  const next = steps[index + 1];
  const go = (target: ScreenEntry | undefined) =>
    target ? () => void navigate(hrefForStep(target.slug)) : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <Stepper steps={steps} index={index} hrefForStep={hrefForStep} />
      <div className="min-h-0 flex-1">
        <ActiveStep />
      </div>
      {flow.flowButtons === false ? null : (
        <div className="flex justify-between border-t border-border p-4">
          <Button variant="ghost" disabled={!prev} onClick={go(prev)}>
            Back
          </Button>
          <Button disabled={!next} onClick={go(next)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
