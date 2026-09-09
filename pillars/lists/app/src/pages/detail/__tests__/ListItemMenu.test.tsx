import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ListItemMenu, type ListItemMenuProps } from '../ListItemMenu';

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

function renderMenu(overrides: Partial<ListItemMenuProps> = {}) {
  return render(
    <Wrapper>
      {/* Mimics the row's own overflow:auto scroll container — the bug the
          portal fixes. */}
      <div
        data-testid="scroll-container"
        style={{ overflow: 'hidden', height: '20px', width: '20px' }}
      >
        <ListItemMenu
          canMoveUp={true}
          canMoveDown={true}
          onEdit={noop}
          onMoveUp={noop}
          onMoveDown={noop}
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

describe('ListItemMenu', () => {
  it('portals the open menu outside the clipping scroll container', async () => {
    renderMenu();
    const menu = await openMenu();
    const container = screen.getByTestId('scroll-container');
    expect(container.contains(menu)).toBe(false);
  });

  it('skips the disabled Move up item during Arrow navigation', async () => {
    renderMenu({ canMoveUp: false, canMoveDown: true });
    await openMenu();
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((el) => el.textContent)).toEqual(['Edit', 'Move up', 'Move down', 'Delete']);
    const [edit, moveUp, moveDown] = items;
    expect(moveUp).toHaveAttribute('aria-disabled', 'true');

    await userEvent.keyboard('{ArrowDown}');
    expect(edit).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(moveDown).toHaveFocus();
  });

  it('closes on Escape', async () => {
    renderMenu();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('invokes onMoveDown and closes when Move down is chosen', async () => {
    const onMoveDown = vi.fn();
    renderMenu({ onMoveDown });
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /move down/i }));
    expect(onMoveDown).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
