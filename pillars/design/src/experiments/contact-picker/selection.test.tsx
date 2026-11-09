import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContactPickerWorkspace } from './workspace';

describe('contact picker identity and source filtering', () => {
  it.each(['inline', 'dialog'] as const)(
    'selects same-name source identities independently in %s',
    (layout) => {
      render(<ContactPickerWorkspace layout={layout} scenario="duplicate-names" />);
      fireEvent.change(screen.getByLabelText('Search contacts'), {
        target: { value: 'Marina Duarte' },
      });
      const results = within(screen.getByRole('region', { name: 'Contact results' }));
      const identities = results.getAllByRole('button', { name: /Marina Duarte/ });
      expect(identities).toHaveLength(2);
      const first = identities[0];
      const second = identities[1];
      if (!first || !second) throw new Error('Expected two source identities.');
      fireEvent.click(first);
      expect(first).toHaveAttribute('aria-pressed', 'true');
      expect(second).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(second);
      expect(first).toHaveAttribute('aria-pressed', 'true');
      expect(second).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      const contacts = within(screen.getByRole('region', { name: 'Contacts' }));
      const firstRemove = contacts.getByRole('button', {
        name: 'Remove Marina Duarte · Contact 1',
      });
      expect(
        contacts.getByRole('button', { name: 'Remove Marina Duarte · Contact 2' })
      ).toBeInTheDocument();
      fireEvent.click(firstRemove);
      expect(
        contacts.queryByRole('button', { name: 'Remove Marina Duarte · Contact 1' })
      ).not.toBeInTheDocument();
      expect(
        contacts.getByRole('button', { name: 'Remove Marina Duarte · Contact 2' })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' }));
      const restoredResults = within(screen.getByRole('region', { name: 'Contact results' }));
      expect(
        restoredResults.getByRole('button', { name: /Marina Duarte · Contact 1/ })
      ).toHaveAttribute('aria-pressed', 'false');
      expect(
        restoredResults.getByRole('button', { name: /Marina Duarte · Contact 2/ })
      ).toHaveAttribute('aria-pressed', 'true');
    }
  );

  it.each(['inline', 'dialog'] as const)(
    'keeps explicit source-type filtering across dismissal in %s',
    (layout) => {
      render(<ContactPickerWorkspace layout={layout} scenario="business" />);
      fireEvent.click(screen.getByRole('combobox', { name: 'Contact type' }));
      fireEvent.click(screen.getByRole('option', { name: 'Company' }));
      expect(screen.getByRole('region', { name: 'Contact results' })).not.toHaveTextContent(
        'Marina Duarte'
      );
      expect(
        within(screen.getByRole('region', { name: 'Contact results' })).getByRole('button', {
          name: /Pousada do Carmo/,
        })
      ).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' }));
      expect(screen.getByRole('combobox', { name: 'Contact type' })).toHaveTextContent('Company');
    }
  );
});
