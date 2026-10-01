import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@pops/ui';

import { DrawTierButtons } from '../../components/DrawTierButtons';
import { ArenaHeader } from './ArenaHeader';
import { ArenaPrompt } from './ArenaPrompt';

vi.mock('../../components/DimensionManager', () => ({
  DimensionManager: () => createElement('button', null, 'Manage dimensions'),
}));

function renderWithProviders(children: ReactNode) {
  return render(
    <MemoryRouter>
      <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
  );
}

describe('Compare Arena touch labels', () => {
  it('shows the draw and skip meanings beside their icons at touch widths', () => {
    const onDraw = vi.fn();
    const onSkip = vi.fn();
    renderWithProviders(
      <DrawTierButtons onDraw={onDraw} onSkip={onSkip} disabled={false} skipPending={false} />
    );

    for (const label of ['Equally great', 'Equally average', 'Equally poor', 'Skip pair']) {
      expect(screen.getByText(label)).toHaveClass('sm:hidden');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Equally great' }));
    expect(onDraw).toHaveBeenCalledWith('high');
    fireEvent.click(screen.getByRole('button', { name: 'Skip this pair' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('opens the dimension description by tapping its name', () => {
    renderWithProviders(
      <ArenaPrompt
        dimensionName="Cinematography"
        dimensionDescription="Camera work, framing, lighting, and visual composition."
      />
    );

    const trigger = screen.getByRole('button', { name: 'Show description for Cinematography' });
    expect(trigger).toHaveClass('sm:hidden');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const description = screen.getByText('Camera work, framing, lighting, and visual composition.');
    expect(description).toHaveAttribute('hidden');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('Camera work, framing, lighting, and visual composition.')
    ).not.toHaveAttribute('hidden');
  });

  it('shows the history label with its icon at touch widths', () => {
    renderWithProviders(<ArenaHeader sessionCount={0} />);

    expect(screen.getByText('History')).toHaveClass('sm:hidden');
    expect(screen.getByRole('link', { name: 'Comparison history' })).toHaveAttribute(
      'href',
      '/media/compare/history'
    );
  });
});
