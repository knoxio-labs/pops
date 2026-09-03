import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { makeCatalog, makeScreen } from '../test/factories';
import { SidebarScreens } from './SidebarScreens';

import type { Catalog } from '../registry';

const CATALOG: Catalog = makeCatalog({
  screens: [
    makeScreen({ id: 'finance/import-review', title: 'Import review', order: 2 }),
    makeScreen({ id: 'finance/accounts/form', title: 'Account form', order: 1 }),
    makeScreen({ id: 'finance/accounts/pickers/entity', title: 'Entity picker', order: 1 }),
    makeScreen({
      id: 'finance/accounts/link-bank',
      title: 'Link a bank',
      order: 3,
      component: undefined,
      steps: [
        makeScreen({ id: 'finance/accounts/link-bank/choose', title: 'Choose bank', order: 1 }),
        makeScreen({ id: 'finance/accounts/link-bank/confirm', title: 'Confirm', order: 2 }),
      ],
    }),
  ],
});

function renderAt(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <SidebarScreens catalog={CATALOG} />
    </MemoryRouter>
  );
}

/** The active row is the one carrying the accent class the link builder applies. */
function isActive(element: HTMLElement): boolean {
  return element.className.includes('bg-accent');
}

afterEach(cleanup);

describe('SidebarScreens', () => {
  it('nests a screen under every group folder its id names', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Screens' });
    expect(within(nav).getByText('finance')).toBeTruthy();
    expect(within(nav).getByText('Accounts')).toBeTruthy();
    expect(within(nav).getByText('Pickers')).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Entity picker' }).getAttribute('href')).toBe(
      '/s/finance/accounts/pickers/entity'
    );
  });

  it('addresses a nested screen by its whole path', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Account form' }).getAttribute('href')).toBe(
      '/s/finance/accounts/form'
    );
    expect(screen.getByRole('link', { name: 'Import review' }).getAttribute('href')).toBe(
      '/s/finance/import-review'
    );
  });

  it('lists a flow’s steps as `?step=` on the flow’s own path', () => {
    renderAt('/s/finance/accounts/link-bank?step=choose');
    expect(screen.getByRole('link', { name: 'Confirm' }).getAttribute('href')).toBe(
      '/s/finance/accounts/link-bank?step=confirm'
    );
  });

  it('marks only the step the address names, which the router cannot see', () => {
    renderAt('/s/finance/accounts/link-bank?step=confirm');
    expect(isActive(screen.getByRole('link', { name: 'Confirm' }))).toBe(true);
    expect(isActive(screen.getByRole('link', { name: 'Choose bank' }))).toBe(false);
  });

  it('shows no step as active on another screen', () => {
    renderAt('/s/finance/import-review');
    expect(screen.queryByRole('link', { name: 'Confirm' })).toBeNull();
  });
});
