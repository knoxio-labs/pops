import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DuplicateWorkspace } from './workspace';

function select(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('duplicate contact proposals', () => {
  it.each(['sources', 'fields'] as const)(
    'keeps source selections independent and previews chosen name and type in %s',
    (layout) => {
      render(<DuplicateWorkspace layout={layout} />);
      select('Name', 'Marina B. Duarte · Contact 2');
      select('Type', 'Person · Contact 1');
      select('Keep contact', 'Marina B. Duarte · Contact 2');
      expect(screen.getByRole('combobox', { name: 'Name' })).toHaveTextContent(
        'Marina B. Duarte · Contact 2'
      );
      expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent(
        'Person · Contact 1'
      );
      fireEvent.click(screen.getByRole('button', { name: 'Preview merge' }));
      const identity = screen.getByRole('region', { name: 'Merge preview' });
      expect(identity).toHaveTextContent('Marina B. Duarte');
      expect(identity).toHaveTextContent('Person');
      expect(identity).toHaveTextContent('Keep contact: Contact 2');
      const facts = screen.getByRole('region', { name: 'Combined facts' });
      expect(facts).toHaveTextContent('marina@example.test');
      expect(facts).toHaveTextContent('From Contact 1 · Marina Duarte');
      expect(facts).toHaveTextContent('From Contact 2 · Marina B. Duarte');
      const references = screen.getByRole('region', { name: 'Linked records' });
      expect(references).toHaveTextContent('Guaíba walk');
      expect(references).toHaveTextContent('Current: Contact 1 · Marina Duarte');
      expect(references).toHaveTextContent('Preview: Contact 2 · Marina B. Duarte');
      expect(references).not.toHaveTextContent('Clara’s visit');
      expect(
        screen.queryByRole('button', { name: /^merge$|^apply$|^delete$/i })
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Edit choices' }));
      expect(screen.getByRole('combobox', { name: 'Keep contact' })).toHaveTextContent('Contact 2');
    }
  );

  it.each(['sources', 'fields'] as const)(
    'keeps the original facts and identities unchanged across preview and pair dismissal in %s',
    (layout) => {
      render(<DuplicateWorkspace layout={layout} />);
      if (layout === 'fields')
        fireEvent.click(screen.getByText('Sources', { selector: 'summary' }));
      const before = screen.getByRole('region', { name: 'Source contacts' }).textContent;
      fireEvent.click(screen.getByRole('button', { name: 'Preview merge' }));
      fireEvent.click(screen.getByRole('button', { name: 'Edit choices' }));
      if (layout === 'fields')
        fireEvent.click(screen.getByText('Sources', { selector: 'summary' }));
      expect(screen.getByRole('region', { name: 'Source contacts' }).textContent).toBe(before);
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Keep separate' }));
      expect(screen.getByRole('status')).toHaveTextContent('Contacts kept separate');
      expect(screen.queryByRole('button', { name: 'Preview merge' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      if (layout === 'fields')
        fireEvent.click(screen.getByText('Sources', { selector: 'summary' }));
      expect(screen.getByRole('region', { name: 'Source contacts' }).textContent).toBe(before);
      expect(screen.getByRole('button', { name: 'Preview merge' })).toBeEnabled();
    }
  );

  it.each(['sources', 'fields'] as const)('keeps same-name identities distinct in %s', (layout) => {
    render(<DuplicateWorkspace layout={layout} scenario="same-name" />);
    select('Keep contact', 'Marina Duarte · Contact 2');
    fireEvent.click(screen.getByRole('button', { name: 'Preview merge' }));
    expect(screen.getByRole('region', { name: 'Merge preview' })).toHaveTextContent(
      'Keep contact: Contact 2'
    );
    expect(screen.getByRole('region', { name: 'Combined facts' })).toHaveTextContent(
      'other-marina@example.test'
    );
  });

  it.each(['sources', 'fields'] as const)('retains Finance source provenance in %s', (layout) => {
    render(<DuplicateWorkspace layout={layout} scenario="finance" />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview merge' }));
    expect(screen.getByRole('region', { name: 'Merge preview' })).toHaveTextContent(
      'Source: Finance'
    );
    expect(screen.getByRole('region', { name: 'Combined facts' })).toHaveTextContent(
      'Reimburse workshop materials by transfer.'
    );
  });

  it.each(['sources', 'fields'] as const)(
    'shows missing and empty selection errors with no actions in %s',
    (layout) => {
      const view = render(<DuplicateWorkspace layout={layout} scenario="missing-reference" />);
      expect(screen.getByRole('status')).toHaveTextContent('A selected contact is unavailable.');
      expect(screen.queryByRole('button', { name: 'Preview merge' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Keep separate' })).not.toBeInTheDocument();
      view.unmount();
      render(<DuplicateWorkspace layout={layout} scenario="empty" />);
      expect(screen.getByRole('status')).toHaveTextContent('Select two contacts to compare.');
      expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    }
  );

  it('opens fields choices before the collapsed source facts', () => {
    render(<DuplicateWorkspace layout="fields" />);
    const summary = screen.getByText('Sources', { selector: 'summary' });
    expect(summary.closest('details')).not.toHaveAttribute('open');
    const choices = screen.getByRole('region', { name: 'Field choices' });
    expect(within(choices).getByRole('combobox', { name: 'Keep contact' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Combined facts' })).toBeInTheDocument();
  });
});
