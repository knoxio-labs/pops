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

/**
 * A quantity is 0.5 kg as readily as 2, and any numeric `step` makes the
 * fractional one `stepMismatch`-invalid — which blocks submit with no message
 * a user sees. This form carried `noValidate` for that reason, switching off
 * constraint validation for every field rather than the one, until the kit
 * widened `step` to accept `'any'` (POPS-3299).
 *
 * jsdom implements `stepMismatch`, so this is asserted on the control rather
 * than through a submit round-trip. A test that only types an integer passes
 * against `step={1}` and proves nothing.
 */
describe('ShoppingAddForm — a fractional quantity is valid', () => {
  it('lets the quantity field take any step', async () => {
    renderForm();
    expect(screen.getByLabelText('Qty')).toHaveAttribute('step', 'any');
  });

  it('does not report a step mismatch on 0.5', async () => {
    renderForm();
    const qty = screen.getByLabelText('Qty');

    await userEvent.type(qty, '0.5');

    expect((qty as HTMLInputElement).validity.stepMismatch).toBe(false);
  });

  it('leaves the rest of the form answering to native validation', async () => {
    renderForm();
    expect(screen.getByLabelText('Qty').closest('form')).not.toHaveAttribute('novalidate');
  });
});

/**
 * The unit field is an `Autocomplete` sitting between two `TextInput`s. It
 * used to wear `CommandInput`'s search chrome — a magnifier and a
 * bottom-rule-only box — and to offer "No results found." under a unit that
 * is simply not one of the suggestions, which is normal use here rather than
 * a failed search (POPS-3294).
 */
describe('ShoppingAddForm — the unit field looks like the fields beside it', () => {
  it('wears the same container the item field does, and no magnifier', () => {
    renderForm();

    const unit = screen.getByLabelText('Unit').closest('div');
    const item = screen.getByLabelText('Item').closest('div');

    expect(unit).not.toBeNull();
    expect(item).not.toBeNull();
    expect((unit as HTMLElement).className).toBe((item as HTMLElement).className);
    expect(document.querySelector('[data-slot="command-input-wrapper"]')).toBeNull();
  });
});
