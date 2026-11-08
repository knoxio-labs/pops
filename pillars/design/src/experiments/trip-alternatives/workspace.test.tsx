import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AlternativesWorkspace } from './workspace';

describe('alternatives workspace', () => {
  it.each(['paths', 'changes'] as const)(
    'applies a %s preview explicitly and undoes it without losing other options',
    (layout) => {
      render(<AlternativesWorkspace layout={layout} />);
      const working = screen.getByRole('region', { name: 'Working route' });
      expect(working).toHaveTextContent('Northeast');
      const comparison = screen.getByRole('region', { name: 'Compare Belo Horizonte / Minas' });
      expect(comparison).toHaveTextContent('Purchased · outside preview');
      expect(working).not.toHaveTextContent('Minas');
      fireEvent.click(within(comparison).getByRole('button', { name: 'Use path' }));
      expect(working).toHaveTextContent('Minas');
      expect(screen.getByRole('button', { name: 'Preview Northeast' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(working).toHaveTextContent('Northeast');
    }
  );

  it('creates an arbitrary option, extends its path and recalculates event conflicts from source edits', () => {
    render(<AlternativesWorkspace layout="changes" />);
    fireEvent.change(screen.getByLabelText('Belo Horizonte / Minas arrival'), {
      target: { value: '2028-01-27' },
    });
    expect(screen.getByText('Outside visit dates')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New path'), { target: { value: 'Salvador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add path' }));
    expect(screen.getByRole('button', { name: 'Preview Salvador' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('City or region'), { target: { value: 'Aracaju' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add city' }));
    expect(screen.getByRole('region', { name: 'Compare Salvador' })).toHaveTextContent(
      'Salvador → Aracaju'
    );
    expect(screen.getByRole('region', { name: 'Working route' })).not.toHaveTextContent('Salvador');
  });

  it('shows a broken reference and disables its application', () => {
    render(<AlternativesWorkspace layout="changes" scenario="missing-reference" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Northeast' }));
    const comparison = screen.getByRole('region', { name: 'Compare Northeast' });
    expect(comparison).toHaveTextContent('Visit unavailable');
    expect(within(comparison).getByRole('button', { name: 'In route' })).toBeDisabled();
  });
});
