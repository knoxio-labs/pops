import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { WebFrame } from './WebFrame';

afterEach(cleanup);

function renderFrame(area: string | undefined, slug?: string) {
  return render(
    <WebFrame area={area} slug={slug}>
      <p>surface</p>
    </WebFrame>
  );
}

describe('WebFrame', () => {
  it('draws the chrome around the surface without replacing it', () => {
    renderFrame('finance', 'import-review');
    expect(screen.getByText('surface')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'POPS' })).toBeInTheDocument();
  });

  it('lists the active app’s real pages', () => {
    renderFrame('finance', 'import-review');
    const nav = screen.getByRole('navigation', { name: 'Finance pages' });
    expect(nav).toHaveTextContent('Import');
  });

  it('carries the active app’s accent, so the surface is themed as it ships', () => {
    const { container } = renderFrame('finance', 'import-review');
    expect(container.querySelector('.app-emerald')).not.toBeNull();
  });

  it('draws the rail with nothing selected for an area no app owns', () => {
    renderFrame('not-a-pillar');
    expect(screen.getByText('surface')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
