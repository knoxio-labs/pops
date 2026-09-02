import { describe, expect, it } from 'vitest';

import { makeExperiment, makeScreen, makeVariant } from '../test/factories';
import { linkExperimentsToScreens } from './lineage';

describe('linkExperimentsToScreens', () => {
  it('attaches an experiment to the main screen it explores, with no errors', () => {
    const home = makeScreen({ id: 'a/home' });
    const exp = makeExperiment({
      id: 'rebrand',
      screen: 'a/home',
      variants: [makeVariant({ id: 'v1' })],
    });
    const errors: string[] = [];

    linkExperimentsToScreens([home], [exp], errors);

    expect(errors).toEqual([]);
    expect(home.experiments).toEqual([exp]);
  });

  it('resolves a screen that exists only in the experiment’s variants', () => {
    const exp = makeExperiment({
      id: 'onboarding',
      screen: 'a/welcome',
      variants: [makeVariant({ id: 'v1', screens: [makeScreen({ id: 'a/welcome' })] })],
    });
    const errors: string[] = [];

    linkExperimentsToScreens([makeScreen({ id: 'a/home' })], [exp], errors);

    expect(errors).toEqual([]);
  });

  it('errors when the screen matches nothing', () => {
    const exp = makeExperiment({
      id: 'ghost',
      screen: 'a/nowhere',
      variants: [makeVariant({ id: 'v1' })],
    });
    const errors: string[] = [];

    linkExperimentsToScreens([makeScreen({ id: 'a/home' })], [exp], errors);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('screen "a/nowhere"');
  });

  it('errors when two active experiments share a screen', () => {
    const home = makeScreen({ id: 'a/home' });
    const a = makeExperiment({
      id: 'a-exp',
      screen: 'a/home',
      variants: [makeVariant({ id: 'v1' })],
    });
    const b = makeExperiment({
      id: 'b-exp',
      screen: 'a/home',
      variants: [makeVariant({ id: 'v1' })],
    });
    const errors: string[] = [];

    linkExperimentsToScreens([home], [a, b], errors);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('at most one active experiment per screen');
    expect(home.experiments).toEqual([a, b]);
  });

  it('does not count decided or archived experiments against the rule', () => {
    const home = makeScreen({ id: 'a/home' });
    const decided = makeExperiment({
      id: 'old',
      screen: 'a/home',
      status: 'decided',
      variants: [makeVariant({ id: 'v1' })],
    });
    const active = makeExperiment({
      id: 'new',
      screen: 'a/home',
      variants: [makeVariant({ id: 'v1' })],
    });
    const errors: string[] = [];

    linkExperimentsToScreens([home], [decided, active], errors);

    expect(errors).toEqual([]);
  });
});
