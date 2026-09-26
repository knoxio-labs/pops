import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Archive, Download, LockKeyhole } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectionBar } from './selection-bar';

import type { SelectionBarAction } from '../model';
import type { SelectionBarProps } from './selection-bar';

function renderBar(overrides: Partial<SelectionBarProps> = {}) {
  return render(
    <SelectionBar
      count={2}
      loadedCount={5}
      coverage="some"
      actions={[]}
      onClear={vi.fn()}
      {...overrides}
    />
  );
}

afterEach(cleanup);

describe('SelectionBar', () => {
  it('renders nothing when no rows are selected', () => {
    const { container } = renderBar({ count: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the selected and carried counts politely', () => {
    renderBar({ carriedCount: 3 });
    const summary = screen.getByText('2 selected, 3 inside');
    expect(summary).toHaveAttribute('aria-live', 'polite');
    expect(summary).toHaveAttribute('aria-atomic', 'true');
  });

  it('shows Select all only for a partial selection with more loaded rows', () => {
    const onSelectAll = vi.fn();
    const view = renderBar({ onSelectAll });
    const selectAll = screen.getByRole('button', { name: 'Select all 5' });
    fireEvent.click(selectAll);
    expect(onSelectAll).toHaveBeenCalledOnce();

    view.rerender(
      <SelectionBar
        count={5}
        loadedCount={5}
        coverage="all"
        actions={[]}
        onSelectAll={onSelectAll}
      />
    );
    expect(screen.queryByRole('button', { name: 'Select all 5' })).not.toBeInTheDocument();
  });

  it('renders inline actions with shortcut hints and runs live actions', () => {
    const onArchive = vi.fn();
    const actions: SelectionBarAction[] = [
      { id: 'archive', label: 'Archive', icon: Archive, shortcutId: 'move', onSelect: onArchive },
    ];
    renderBar({ actions });

    const archive = screen.getByRole('button', { name: /^Archive/ });
    expect(screen.getByLabelText('M')).toBeInTheDocument();
    fireEvent.click(archive);
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it('keeps disabled actions visible, explains the refusal, and does not run them', async () => {
    const onArchive = vi.fn();
    const actions: SelectionBarAction[] = [
      {
        id: 'archive',
        label: 'Archive',
        icon: LockKeyhole,
        onSelect: onArchive,
        disabledReason: 'Unavailable while offline.',
      },
    ];
    renderBar({ actions });

    const archive = screen.getByRole('button', { name: /^Archive/ });
    expect(archive).toHaveAttribute('aria-disabled', 'true');
    expect(archive).toHaveClass('opacity-50');
    fireEvent.click(archive);
    expect(onArchive).not.toHaveBeenCalled();

    fireEvent.pointerMove(archive);
    await waitFor(() => expect(screen.getByText('Unavailable while offline.')).toBeInTheDocument());
  });

  it('puts overflow actions in More and runs them from the menu', () => {
    const onDownload = vi.fn();
    const actions: SelectionBarAction[] = [
      { id: 'download', label: 'Download', icon: Download, overflow: true, onSelect: onDownload },
    ];
    renderBar({ actions });
    expect(screen.queryByRole('menuitem', { name: 'Download' })).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for the selection' }), {
      button: 0,
      pointerType: 'mouse',
    });
    const download = screen.getByRole('menuitem', { name: 'Download' });
    fireEvent.click(download);
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('renders disabled overflow actions but leaves them unavailable', () => {
    const onDownload = vi.fn();
    const actions: SelectionBarAction[] = [
      {
        id: 'download',
        label: 'Download',
        icon: Download,
        overflow: true,
        onSelect: onDownload,
        disabledReason: 'No connection.',
      },
    ];
    renderBar({ actions });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions for the selection' }), {
      button: 0,
      pointerType: 'mouse',
    });
    const download = screen.getByRole('menuitem', { name: 'Download' });
    expect(download).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(download);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('clears the selection from the trailing action', () => {
    const onClear = vi.fn();
    renderBar({ onClear });
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
