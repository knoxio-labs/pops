import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ListEditModal } from '../ListEditModal';

import type { ListRow } from '../types';

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['lists'],
      defaultNS: 'lists',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { lists: enAULists } },
    });
    return instance;
  }, []);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

const list: ListRow = {
  id: 7,
  name: 'Weekend shop',
  kind: 'shopping',
  ownerApp: 'user',
  archivedAt: null,
  createdAt: '2026-06-01T00:00:00Z',
};

function renderModal() {
  const onSave = vi.fn();
  render(
    <Wrapper>
      <ListEditModal
        list={list}
        isSaving={false}
        onCancel={vi.fn()}
        onSave={onSave}
        onArchiveToggle={vi.fn()}
      />
    </Wrapper>
  );
  return { onSave };
}

describe('ListEditModal', () => {
  it('shows the current kind as the only selected option', () => {
    renderModal();
    expect(screen.getByRole('radio', { name: 'Shopping' })).toBeChecked();
    for (const other of ['Packing', 'Todo', 'Generic']) {
      expect(screen.getByRole('radio', { name: other })).not.toBeChecked();
    }
  });

  it('keeps the kind options mutually exclusive when another is picked', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('radio', { name: 'Todo' }));
    expect(screen.getByRole('radio', { name: 'Todo' })).toBeChecked();
    for (const other of ['Shopping', 'Packing', 'Generic']) {
      expect(screen.getByRole('radio', { name: other })).not.toBeChecked();
    }
    expect(screen.getByRole('status')).toHaveTextContent(/changing kind/i);
  });

  it('walks the kind options with the arrow keys and selects with the spacebar', async () => {
    const { onSave } = renderModal();
    await userEvent.click(screen.getByRole('radio', { name: 'Shopping' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Packing' })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(screen.getByRole('radio', { name: 'Packing' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Shopping' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Weekend shop', kind: 'packing' });
  });

  it('reports the name as required when it is cleared', async () => {
    const { onSave } = renderModal();
    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
