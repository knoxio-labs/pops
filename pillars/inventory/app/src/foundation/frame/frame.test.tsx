import { fireEvent, render, screen, within } from '@testing-library/react';
import { Package } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { NewItemButton } from './new-item-button';
import { AccentTile, InventoryPage, PAGE_HEIGHT } from './page-frame';
import { Segmented } from './segmented';

describe('AccentTile', () => {
  it('uses the compact and record-size token classes', () => {
    const { rerender } = render(<AccentTile icon={Package} />);
    const compactIcon = document.querySelector('svg');
    expect(compactIcon?.parentElement).toHaveClass('size-9', 'bg-app-accent/15');

    rerender(<AccentTile icon={Package} size="lg" />);
    expect(document.querySelector('svg')?.parentElement).toHaveClass('size-11');
  });
});

describe('InventoryPage', () => {
  it('wires router links and keeps the body in the remaining frame space', () => {
    render(
      <MemoryRouter>
        <InventoryPage
          title="Items"
          icon={Package}
          breadcrumbs={[{ label: 'Inventory', href: '/inventory' }, { label: 'Items' }]}
          tabs={<div data-testid="tabs">Tabs</div>}
          banner={<div data-testid="banner">Banner</div>}
          toolbar={<div data-testid="toolbar">Toolbar</div>}
          dock={<div data-testid="dock">Dock</div>}
          overlay={<div data-testid="overlay">Overlay</div>}
          bodyClassName="body-token"
        >
          <div data-testid="body">Body</div>
        </InventoryPage>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/inventory');
    expect(screen.getByRole('heading', { name: 'Items' })).toBeInTheDocument();

    const body = screen.getByTestId('body');
    const frame = body.parentElement?.parentElement;
    expect(frame).toHaveClass('relative', 'flex', 'min-h-120', 'flex-col', 'gap-4', PAGE_HEIGHT);
    expect(body.parentElement).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'body-token');

    const renderedOrder = [
      screen.getByRole('heading', { name: 'Items' }),
      screen.getByTestId('tabs'),
      screen.getByTestId('banner'),
      screen.getByTestId('toolbar'),
      body,
      screen.getByTestId('dock'),
      screen.getByTestId('overlay'),
    ];
    const isInDocumentOrder = renderedOrder.slice(1).every((element, index) => {
      const previous = renderedOrder[index];
      return (
        previous !== undefined &&
        Boolean(previous.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    });
    expect(isInDocumentOrder).toBe(true);
  });
});

describe('Segmented', () => {
  it('changes only to declared segments and styles attention counts', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Inventory views"
        segments={[
          { id: 'items', label: 'Items', count: 12 },
          { id: 'attention', label: 'Needs attention', count: 3, alert: true },
          { id: 'empty', label: 'Empty', count: 0, alert: true },
        ]}
        value="items"
        onChange={onChange}
      />
    );

    expect(screen.getByRole('tablist', { name: 'Inventory views' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Items12' })).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('tab', { name: 'Needs attention3' })).getByText('3')
    ).toHaveClass('rounded-full', 'bg-warning/20');
    expect(within(screen.getByRole('tab', { name: 'Empty0' })).getByText('0')).not.toHaveClass(
      'bg-warning/20'
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Needs attention3' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(onChange).toHaveBeenCalledWith('attention');
  });
});

describe('NewItemButton', () => {
  it('navigates to the exact item, bulk-entry, and import routes', () => {
    const onNavigate = vi.fn();
    render(<NewItemButton onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(onNavigate).toHaveBeenCalledWith('/inventory/items/new');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More ways to add' }), {
      button: 0,
      pointerType: 'mouse',
    });
    const menu = screen.getByRole('menu');
    const bulkEntry = within(menu).getByRole('menuitem', { name: /Bulk entry/ });
    expect(within(bulkEntry).getByLabelText('⇧ N')).toBeInTheDocument();

    fireEvent.click(bulkEntry);
    expect(onNavigate).toHaveBeenCalledWith('/inventory/items/bulk-new');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More ways to add' }), {
      button: 0,
      pointerType: 'mouse',
    });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Import CSV' }));
    expect(onNavigate).toHaveBeenCalledWith('/inventory/import');
  });

  it('disables both add paths and explains the offline state', () => {
    const onNavigate = vi.fn();
    render(<NewItemButton offline onNavigate={onNavigate} />);

    expect(screen.getByRole('button', { name: 'More ways to add' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New item' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'New item' }));
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
