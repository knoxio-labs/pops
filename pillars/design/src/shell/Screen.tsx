import { Navigate, useParams, useSearchParams } from 'react-router';

import { catalog } from '../registry';
import { buildAddress, screenIdOf, type Address } from './address';
import { Flow } from './Flow';
import { resolveScreens } from './surface';
import { FRAME_PREFIX } from './viewport';

import type { ComponentType } from 'react';

import type { ScreenEntry } from '../registry';

/** The default render, or a named state's thunk when `?state=` selects one. */
function renderOf(screen: ScreenEntry, state: string | null): ComponentType | undefined {
  if (state && screen.states?.[state]) return screen.states[state];
  return screen.component;
}

function Note({ children }: { children: string }) {
  return <p className="p-8 text-muted-foreground">{children}</p>;
}

/**
 * The frame-side route element for one surface: resolves the design
 * (main or variant), the screen, the step and the state from the URL, and
 * renders it. Every "not found" is a note, never a crash — a half-written
 * screen must not take the canvas down.
 *
 * The screen path arrives as a splat, because a screen sits as deep as its
 * groups nest and a fixed set of route params could not reach it.
 */
export function Screen() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const state = searchParams.get('state');
  const address: Address = {
    experimentId: params.experimentId,
    variantId: params.variantId,
    path: (params['*'] ?? '').split('/').filter(Boolean),
    stepId: searchParams.get('step') ?? undefined,
  };

  const screens = resolveScreens(catalog, address.experimentId, address.variantId);
  if (!screens) return <Note>Variant not found.</Note>;
  const screen = screens.find((s) => s.id === screenIdOf(address));
  if (!screen) return <Note>Screen not found.</Note>;

  if (screen.steps) {
    const hrefForStep = (stepId: string) =>
      `${FRAME_PREFIX}${buildAddress({ ...address, stepId, state: state ?? undefined })}`;
    const first = screen.steps[0];
    if (!address.stepId) {
      if (!first) return <Note>Flow has no steps.</Note>;
      return <Navigate replace to={hrefForStep(first.slug)} />;
    }
    return <Flow flow={screen} stepId={address.stepId} state={state} hrefForStep={hrefForStep} />;
  }

  const Render = renderOf(screen, state);
  if (!Render) return <Note>Screen has no content.</Note>;
  return <Render />;
}
