import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InboxWorkspace } from './workspace';

const note = 'Ask Clara about a walk along the waterfront.';
const sourceText = `${note}\nFind a morning that works for both of us.`;

function openNote() {
  fireEvent.click(screen.getByRole('button', { name: `Open ${note}` }));
}

function closeItem(layout: 'inline' | 'dialog') {
  if (layout === 'inline') fireEvent.click(screen.getByRole('button', { name: 'Close item' }));
  else fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
}

describe('source-preserving Inbox organisation', () => {
  it.each(['inline', 'dialog'] as const)(
    'links and unlinks an existing item with Undo in %s',
    (layout) => {
      render(<InboxWorkspace layout={layout} />);
      openNote();
      expect(screen.getByRole('region', { name: 'Raw source' })).toHaveTextContent(
        'Find a morning that works for both of us.'
      );
      fireEvent.click(screen.getByRole('combobox', { name: 'Existing trip item' }));
      fireEvent.click(screen.getByRole('option', { name: /Walk in the old town/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
      const links = screen.getByRole('region', { name: 'Linked trip items' });
      expect(links).toHaveTextContent('Walk in the old town');
      fireEvent.click(within(links).getByRole('button', { name: /Unlink Walk in the old town/ }));
      expect(screen.queryByRole('region', { name: 'Linked trip items' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Raw source' })).toHaveTextContent(note);
      fireEvent.click(screen.getByRole('combobox', { name: 'Existing trip item' }));
      expect(screen.getByRole('option', { name: /Walk in the old town/ })).toBeInTheDocument();
      fireEvent.keyDown(screen.getByPlaceholderText('Search trip items'), {
        key: 'Escape',
      });
      closeItem(layout);
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      openNote();
      expect(screen.getByRole('region', { name: 'Linked trip items' })).toHaveTextContent(
        'Walk in the old town'
      );
    }
  );

  it.each(['inline', 'dialog'] as const)(
    'creates only explicit typed fields and preserves raw material in %s',
    (layout) => {
      render(<InboxWorkspace layout={layout} />);
      openNote();
      fireEvent.click(screen.getByRole('button', { name: 'New item' }));
      expect(screen.getByRole('textbox', { name: 'New item title' })).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Create item' })).toBeDisabled();
      fireEvent.change(screen.getByRole('textbox', { name: 'New item title' }), {
        target: { value: 'Waterfront breakfast' },
      });
      expect(screen.getByRole('button', { name: 'Create item' })).toBeDisabled();
      fireEvent.click(screen.getByRole('combobox', { name: 'New item type' }));
      fireEvent.click(screen.getByRole('option', { name: 'Activity / idea' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create item' }));
      const links = screen.getByRole('region', { name: 'Linked trip items' });
      expect(links).toHaveTextContent('Waterfront breakfast');
      expect(links).toHaveTextContent('Considering');
      expect(links).toHaveTextContent('Not arranged');
      expect(links).not.toHaveTextContent('Find a morning');
      expect(screen.getByRole('region', { name: 'Raw source' })).toHaveTextContent(
        'Find a morning that works for both of us.'
      );
      closeItem(layout);
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      openNote();
      expect(screen.queryByRole('region', { name: 'Linked trip items' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Raw source' }).textContent).toContain(sourceText);
    }
  );
});
