import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContactPickerWorkspace } from './workspace';

function edit(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function close() {
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' }));
}

function results() {
  return within(screen.getByRole('region', { name: 'Contact results' }));
}

function choosePerson() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Type' }));
  fireEvent.click(screen.getByRole('option', { name: 'Person' }));
}

describe('contact picker proposals', () => {
  it.each(['inline', 'dialog'] as const)(
    'links multiple existing contacts with one click each and preserves search across dismissal in %s',
    (layout) => {
      render(<ContactPickerWorkspace layout={layout} />);
      fireEvent.click(results().getByRole('button', { name: /Marina Duarte/ }));
      fireEvent.click(results().getByRole('button', { name: /Pousada do Carmo/ }));
      expect(results().getByRole('button', { name: /Marina Duarte/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(results().getByRole('button', { name: /Pousada do Carmo/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      edit('Search contacts', 'Pousada');
      close();
      const people = screen.getByRole('region', { name: 'Contacts' });
      expect(people).toHaveTextContent('Clara Silva');
      expect(people).toHaveTextContent('Marina Duarte');
      expect(people).toHaveTextContent('Pousada do Carmo');
      open();
      expect(screen.getByLabelText('Search contacts')).toHaveValue('Pousada');
      expect(results().getByRole('button', { name: /Pousada do Carmo/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    }
  );

  it.each(['inline', 'dialog'] as const)(
    'retains the event draft through linking, creation and Undo in %s',
    (layout) => {
      render(<ContactPickerWorkspace layout={layout} />);
      close();
      edit('Event title', 'Edited event');
      edit('Date', '2027-02-03');
      edit('Event notes', 'Keep this unsaved note.');
      open();
      fireEvent.click(results().getByRole('button', { name: /Marina Duarte/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));
      edit('Name *', 'Brand new contact');
      choosePerson();
      fireEvent.click(screen.getByRole('button', { name: 'Create and link' }));
      close();
      expect(screen.getByRole('region', { name: 'Contacts' })).toHaveTextContent(
        'Brand new contact'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('region', { name: 'Contacts' })).not.toHaveTextContent(
        'Brand new contact'
      );
      expect(screen.getByRole('region', { name: 'Contacts' })).toHaveTextContent('Marina Duarte');
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('region', { name: 'Contacts' })).not.toHaveTextContent(
        'Marina Duarte'
      );
      expect(screen.getByLabelText('Event title')).toHaveValue('Edited event');
      expect(screen.getByLabelText('Date')).toHaveValue('2027-02-03');
      expect(screen.getByLabelText('Event notes')).toHaveValue('Keep this unsaved note.');
      open();
      edit('Search contacts', 'Brand new contact');
      expect(screen.getByRole('status')).toHaveTextContent('No contacts found.');
    }
  );

  it.each(['inline', 'dialog'] as const)(
    'resumes an explicit creation draft after dismissal and cancels without adding a contact in %s',
    (layout) => {
      render(<ContactPickerWorkspace layout={layout} />);
      edit('Search contacts', 'Draft name');
      fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));
      expect(screen.getByLabelText('Name *')).toHaveValue('Draft name');
      expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Select type');
      edit('Name *', 'Edited draft name');
      fireEvent.click(screen.getByRole('button', { name: 'Add contact method' }));
      edit('Label 1', 'Signal');
      edit('Value 1', 'draft-handle');
      close();
      open();
      expect(screen.getByLabelText('Name *')).toHaveValue('Edited draft name');
      expect(screen.getByLabelText('Value 1')).toHaveValue('draft-handle');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('status')).toHaveTextContent('No contacts found.');
      close();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      expect(screen.getByRole('region', { name: 'Contacts' })).not.toHaveTextContent(
        'Edited draft name'
      );
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));
      expect(screen.getByLabelText('Name *')).toHaveValue('Draft name');
      expect(screen.queryByLabelText('Value 1')).not.toBeInTheDocument();
    }
  );

  it.each(['inline', 'dialog'] as const)(
    'validates required creation facts and links only after a valid explicit type in %s',
    (layout) => {
      render(<ContactPickerWorkspace layout={layout} scenario="empty" />);
      fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create and link' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.');
      edit('Name *', 'New person');
      fireEvent.click(screen.getByRole('button', { name: 'Create and link' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Choose a contact kind.');
      choosePerson();
      fireEvent.click(screen.getByRole('button', { name: 'Create and link' }));
      expect(results().getByRole('button', { name: /New person/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      close();
      expect(screen.getByRole('region', { name: 'Contacts' })).toHaveTextContent('New person');
    }
  );

  it.each(['inline', 'dialog'] as const)(
    'retains unavailable linked identities as removable chips in %s',
    (layout) => {
      render(<ContactPickerWorkspace layout={layout} scenario="missing-reference" />);
      close();
      expect(screen.getByRole('region', { name: 'Contacts' })).toHaveTextContent(
        'Contact unavailable'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Remove Contact unavailable' }));
      expect(screen.getByRole('region', { name: 'Contacts' })).not.toHaveTextContent(
        'Contact unavailable'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      expect(screen.getByRole('region', { name: 'Contacts' })).toHaveTextContent(
        'Contact unavailable'
      );
    }
  );
});
