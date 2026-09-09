import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ListDetailMenu, type ListDetailMenuProps } from '../ListDetailMenu';

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

function noop() {
  /* no-op */
}

function renderMenu(overrides: Partial<ListDetailMenuProps> = {}) {
  return render(
    <Wrapper>
      {/* Mimics the real overflow:auto scroll container the header sits in.
          A hand-rolled `absolute` menu clips against this; a portalled one
          does not — that's the bug POPS-3180 fixes. */}
      <div
        data-testid="scroll-container"
        style={{ overflow: 'hidden', height: '20px', width: '20px' }}
      >
        <ListDetailMenu
          isArchived={false}
          onRename={noop}
          onChangeKind={noop}
          onArchiveToggle={noop}
          onDelete={noop}
          {...overrides}
        />
      </div>
    </Wrapper>
  );
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /actions/i }));
  return screen.findByRole('menu');
}

describe('ListDetailMenu', () => {
  it('portals the open menu outside the clipping scroll container', async () => {
    renderMenu();
    const menu = await openMenu();
    const container = screen.getByTestId('scroll-container');
    expect(container.contains(menu)).toBe(false);
  });

  it('moves focus with ArrowDown/ArrowUp and jumps with Home/End', async () => {
    renderMenu();
    await openMenu();
    const items = await screen.findAllByRole('menuitem');

    await userEvent.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    expect(items[0]).toHaveFocus();

    await userEvent.keyboard('{End}');
    expect(items[items.length - 1]).toHaveFocus();

    await userEvent.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
  });

  it('closes on Escape', async () => {
    renderMenu();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows Restore instead of Archive once the list is archived', async () => {
    renderMenu({ isArchived: true });
    await openMenu();
    expect(screen.getByRole('menuitem', { name: /restore/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^archive$/i })).not.toBeInTheDocument();
  });

  it('invokes the matching handler and closes when an item is chosen', async () => {
    const onDelete = vi.fn();
    renderMenu({ onDelete });
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
