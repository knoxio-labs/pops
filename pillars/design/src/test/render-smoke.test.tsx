import '../i18n';

import { cleanup, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { buildCatalog } from '../registry/catalog';

import type { ScreenEntry } from '../registry';

/**
 * Every discovered screen, step, state and variant must mount without
 * throwing. This is the cheap net that catches a broken import or a bad
 * fixture shape the moment a screen is added; it asserts "it renders", not
 * how it looks.
 */
interface Case {
  label: string;
  node: ReactNode;
}

function casesFor(label: string, screen: ScreenEntry): Case[] {
  if (screen.steps) return screen.steps.flatMap((step) => casesFor(`${label}/${step.slug}`, step));
  const cases: Case[] = [];
  if (screen.component) cases.push({ label, node: createElement(screen.component) });
  for (const [name, thunk] of Object.entries(screen.states ?? {})) {
    cases.push({ label: `${label}?state=${name}`, node: createElement(thunk) });
  }
  return cases;
}

const catalog = buildCatalog();
const mainCases = catalog.screens.flatMap((screen) => casesFor(`s/${screen.id}`, screen));
const variantCases = catalog.experiments.flatMap((exp) =>
  exp.variants.flatMap((variant) =>
    variant.screens.flatMap((screen) =>
      casesFor(`x/${exp.id}/${variant.id}/s/${screen.id}`, screen)
    )
  )
);
const allCases = [...mainCases, ...variantCases];

afterEach(cleanup);

describe('render smoke', () => {
  it('has screens to render', () => {
    expect(mainCases.length).toBeGreaterThan(0);
  });

  it.each(allCases)('renders $label without throwing', ({ node }) => {
    expect(() => render(<MemoryRouter>{node}</MemoryRouter>)).not.toThrow();
  });
});
