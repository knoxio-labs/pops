import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DROP_TARGET_CLASS, DragDock, DragGhost, DropHint } from './drag-dock';

describe('DROP_TARGET_CLASS', () => {
  it('keeps idle targets unstyled and gives each active state a distinct affordance', () => {
    expect(DROP_TARGET_CLASS.idle).toBe('');
    expect(DROP_TARGET_CLASS.available).toContain('outline-dashed');
    expect(DROP_TARGET_CLASS.over).toContain('bg-app-accent/15');
    expect(DROP_TARGET_CLASS.refused).toContain('cursor-no-drop');
  });
});

describe('DragDock', () => {
  it('uses singular and plural copy and accents the hovered state', () => {
    const { rerender } = render(<DragDock count={2} state="available" />);
    let dock = screen.getByRole('region', { name: 'In hand drop area' });

    expect(dock).toHaveTextContent('Drop to hold 2 items in hand');
    expect(dock).toHaveClass('border-border', 'bg-muted/60', 'text-muted-foreground');

    rerender(<DragDock count={1} state="over" />);
    dock = screen.getByRole('region', { name: 'In hand drop area' });
    expect(dock).toHaveTextContent('Drop to hold 1 item in hand');
    expect(dock).toHaveClass('border-app-accent', 'bg-app-accent/15', 'text-foreground');
  });

  it('explains refused drops and supplies a fallback reason', () => {
    const { rerender } = render(
      <DragDock count={1} state="refused" reason="Tape measure is already in hand" />
    );
    let dock = screen.getByRole('region', { name: 'In hand drop area' });

    expect(dock).toHaveTextContent('Tape measure is already in hand');
    expect(dock).toHaveClass('cursor-no-drop');

    rerender(<DragDock count={1} state="refused" />);
    dock = screen.getByRole('region', { name: 'In hand drop area' });
    expect(dock).toHaveTextContent('Cannot hold these');
  });
});

describe('DropHint', () => {
  it('renders accepted and refused verdict copy', () => {
    const { rerender } = render(
      <DropHint verdict={{ ok: true, count: 2, targetName: 'Shelving' }} />
    );
    let hint = screen.getByRole('status');

    expect(hint).toHaveTextContent('Move 2 items to Shelving');
    expect(hint).toHaveClass('text-foreground');

    rerender(<DropHint verdict={{ ok: false, reason: 'Office 04 is closed. Open it first.' }} />);
    hint = screen.getByRole('status');
    expect(hint).toHaveTextContent('Office 04 is closed. Open it first.');
    expect(hint).toHaveClass('text-muted-foreground');
  });
});

describe('DragGhost', () => {
  it('shows the dragged name and only adds a count badge for multi-drag', () => {
    const { container, rerender } = render(<DragGhost name="Desk lamp" count={2} />);

    expect(screen.getByText('Desk lamp')).toBeInTheDocument();
    expect(screen.getByText('2')).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(container.querySelector('svg')).toBeInTheDocument();

    rerender(<DragGhost name="Desk lamp" count={1} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
