import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ListItemAddForm } from '../ListItemAddForm';

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

async function renderExpanded() {
  const onAdd = vi.fn(async () => true);
  render(
    <Wrapper>
      <ListItemAddForm isPending={false} onAdd={onAdd} />
    </Wrapper>
  );
  await userEvent.click(screen.getByRole('button', { name: '+ qty / unit' }));
  return { onAdd };
}

describe('ListItemAddForm', () => {
  it('submits the optional qty and unit', async () => {
    const { onAdd } = await renderExpanded();
    await userEvent.type(screen.getByLabelText('Qty'), '2');
    await userEvent.type(screen.getByLabelText('Unit'), 'kg');
    await userEvent.type(screen.getByLabelText('Add item — press Enter'), 'Rice');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ label: 'Rice', qty: 2, unit: 'kg' }));
  });

  it('keeps a cleared quantity unset rather than coercing it to 0', async () => {
    const { onAdd } = await renderExpanded();
    const qty = screen.getByLabelText('Qty');
    await userEvent.type(qty, '2');
    await userEvent.clear(qty);
    expect(qty).toHaveValue(null);
    await userEvent.type(screen.getByLabelText('Add item — press Enter'), 'Rice');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ label: 'Rice', qty: null, unit: null })
    );
  });
});
