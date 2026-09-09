import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ShoppingAddForm } from '../ShoppingAddForm';

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

function renderForm() {
  const onAdd = vi.fn(async () => true);
  render(
    <Wrapper>
      <ShoppingAddForm isPending={false} onAdd={onAdd} />
    </Wrapper>
  );
  return { onAdd };
}

describe('ShoppingAddForm', () => {
  it('submits a unit that is not one of the suggestions', async () => {
    const { onAdd } = renderForm();
    await userEvent.type(screen.getByLabelText('Unit'), 'sachets');
    await userEvent.type(screen.getByLabelText('Item'), 'Yeast');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ label: 'Yeast', qty: null, unit: 'sachets' })
    );
  });

  it('submits a unit picked from the suggestions', async () => {
    const { onAdd } = renderForm();
    await userEvent.type(screen.getByLabelText('Unit'), 'bun');
    await userEvent.click(await screen.findByRole('option', { name: 'bunch' }));
    await userEvent.type(screen.getByLabelText('Item'), 'Coriander');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ label: 'Coriander', qty: null, unit: 'bunch' })
    );
  });

  it('keeps a cleared quantity unset rather than coercing it to 0', async () => {
    const { onAdd } = renderForm();
    const qty = screen.getByLabelText('Qty');
    await userEvent.type(qty, '3');
    await userEvent.clear(qty);
    expect(qty).toHaveValue(null);
    await userEvent.type(screen.getByLabelText('Item'), 'Milk');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ label: 'Milk', qty: null, unit: null })
    );
  });
});
