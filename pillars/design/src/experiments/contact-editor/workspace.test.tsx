import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createContactEditorState } from './fixture';
import { ContactEditorWorkspace } from './workspace';

function choosePerson() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Type' }));
  fireEvent.click(screen.getByRole('option', { name: 'Person' }));
}

function edit(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('contact editor proposals', () => {
  it.each(['full', 'progressive'] as const)(
    'creates a distinct contact then restores the original state with Undo in %s',
    (layout) => {
      render(<ContactEditorWorkspace layout={layout} />);
      edit('Name *', 'New contact');
      choosePerson();
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(screen.getByLabelText('Selected contact')).toHaveTextContent('New contact');
      expect(screen.getByLabelText('Selected contact')).toHaveTextContent('Contacts');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.queryByLabelText('Selected contact')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Name *')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    }
  );

  it.each(['full', 'progressive'] as const)(
    'discards drafts on Cancel without a record mutation or history entry in %s',
    (layout) => {
      render(<ContactEditorWorkspace layout={layout} />);
      edit('Name *', 'Discard me');
      choosePerson();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByLabelText('Name *')).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Select type');
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    }
  );

  it('opens progressive optional fields directly and retains repeated arbitrary methods through save', () => {
    render(<ContactEditorWorkspace layout="progressive" />);
    expect(screen.queryByRole('region', { name: 'Contact methods' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add contact method' }));
    const methods = screen.getByRole('region', { name: 'Contact methods' });
    expect(within(methods).getByLabelText('Label 1')).toBeInTheDocument();
    edit('Label 1', 'Signal');
    edit('Value 1', 'custom handle');
    fireEvent.click(within(methods).getByRole('button', { name: 'Add method' }));
    edit('Label 2', 'Signal');
    edit('Value 2', 'another handle');
    edit('Name *', 'Method owner');
    choosePerson();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByLabelText('Value 1')).toHaveValue('custom handle');
    expect(screen.getByLabelText('Value 2')).toHaveValue('another handle');
    fireEvent.click(screen.getByRole('button', { name: 'Remove method 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Value 1')).toHaveValue('custom handle');
    expect(screen.getByLabelText('Value 2')).toHaveValue('another handle');
  });

  it('exposes blank optional rows immediately in the full form and rejects missing required fields', () => {
    render(<ContactEditorWorkspace layout="full" />);
    expect(
      within(screen.getByRole('region', { name: 'Contact methods' })).getByLabelText('Value 1')
    ).toHaveValue('');
    expect(
      within(screen.getByRole('region', { name: 'Addresses' })).getByLabelText('City 1')
    ).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
    edit('Name *', 'No kind');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a contact kind.');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it.each(['full', 'progressive'] as const)(
    'retains all populated source sections while editing and undoing in %s',
    (layout) => {
      const initial = createContactEditorState('edit');
      render(<ContactEditorWorkspace layout={layout} scenario="edit" />);
      expect(screen.getByRole('region', { name: 'Contact methods' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Addresses' })).toBeInTheDocument();
      if (initial.draft.aliases.length)
        expect(screen.getByRole('combobox', { name: 'Aliases' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue(initial.draft.notes);
      edit('Name *', 'Changed name');
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(screen.getByLabelText('Selected contact')).toHaveTextContent('Changed name');
      expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue(initial.draft.notes);
      const methods = within(screen.getByRole('region', { name: 'Contact methods' }));
      expect(methods.getByLabelText('Value 1')).toHaveValue(initial.draft.methods[0]?.value);
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByLabelText('Name *')).toHaveValue(initial.draft.name);
      expect(screen.getByLabelText('Selected contact')).toHaveTextContent(initial.draft.name);
    }
  );
});
