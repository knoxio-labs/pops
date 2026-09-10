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
describe('ListItemAddForm — a fractional quantity is valid', () => {
  it('lets the quantity field take any step', async () => {
    await renderExpanded();
    expect(screen.getByLabelText('Qty')).toHaveAttribute('step', 'any');
  });

  it('does not report a step mismatch on 0.5', async () => {
    await renderExpanded();
    const qty = screen.getByLabelText('Qty');

    await userEvent.type(qty, '0.5');

    expect((qty as HTMLInputElement).validity.stepMismatch).toBe(false);
  });

  it('leaves the rest of the form answering to native validation', async () => {
    await renderExpanded();
    expect(screen.getByLabelText('Qty').closest('form')).not.toHaveAttribute('novalidate');
  });
});
