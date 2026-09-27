import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ReportsShell } from './reports-shell.js';

import type { ComponentProps } from 'react';

function renderShell(
  overrides: Partial<ComponentProps<typeof ReportsShell>> = {}
): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <ReportsShell tab="overview" {...overrides}>
        <div>Report body</div>
      </ReportsShell>
    </MemoryRouter>
  );
}

describe('ReportsShell', () => {
  it('renders all report tabs and keeps actions disabled without callbacks', () => {
    renderShell();

    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByText('Report body')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Values' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Warranties' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Insurance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('enables actions and forwards tab and action events', () => {
    const onTabChange = vi.fn();
    const onExport = vi.fn();
    const onPrint = vi.fn();
    renderShell({ onTabChange, onExport, onPrint });

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Values' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(onTabChange).toHaveBeenCalledWith('values');
    expect(onPrint).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('explains why actions are blocked while a report is unavailable', () => {
    renderShell({ exportBlocked: 'The values report is still loading.' });

    expect(screen.getByRole('button', { name: 'Print' })).toHaveAttribute(
      'title',
      'The values report is still loading.'
    );
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });
});
