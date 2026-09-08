import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import enAULists from '@pops/locales/en-AU/lists.json';

import { ListDetailHeader } from '../../detail/ListDetailHeader';
import { ListRow } from '../../lists-index/ListRow';
import { ListKindChip } from '../ListKindChip';

import type { ListRow as ListRowPayload } from '../../detail/types';
import type { ListIndexItemView } from '../../lists-index/useListsIndexQuery';

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
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

describe('ListKindChip', () => {
  it('renders the localized label for every kind as a kit Badge', () => {
    for (const kind of ['shopping', 'packing', 'todo', 'generic'] as const) {
      const { unmount } = render(
        <Wrapper>
          <ListKindChip kind={kind} />
        </Wrapper>
      );
      const expected = kind.charAt(0).toUpperCase() + kind.slice(1);
      const chip = screen.getByText(expected);
      expect(chip).toHaveAttribute('data-kind', kind);
      unmount();
    }
  });
});

function IndexHost({ item }: { item: ListIndexItemView }): ReactElement {
  const { t } = useTranslation('lists');
  return <ListRow item={item} t={t} />;
}

function buildIndexItem(overrides: Partial<ListIndexItemView> = {}): ListIndexItemView {
  return {
    id: 1,
    name: 'Weekly groceries',
    kind: 'packing',
    ownerApp: 'user',
    itemCount: 1,
    uncheckedCount: 0,
    lastUpdatedAt: '2026-06-09T00:00:00Z',
    archivedAt: null,
    ...overrides,
  };
}

function buildListRow(overrides: Partial<ListRowPayload> = {}): ListRowPayload {
  return {
    id: 1,
    name: 'Camping trip',
    kind: 'todo',
    ownerApp: 'user',
    createdAt: '2026-06-09T00:00:00Z',
    archivedAt: null,
    ...overrides,
  };
}

describe('ListKindChip call sites', () => {
  it('the lists-index ListRow renders the shared chip, not a bespoke one', () => {
    render(
      <Wrapper>
        <IndexHost item={buildIndexItem({ kind: 'packing' })} />
      </Wrapper>
    );
    expect(screen.getByText('Packing')).toHaveAttribute('data-kind', 'packing');
  });

  it('the detail ListDetailHeader renders the shared chip, not a bespoke one', () => {
    render(
      <Wrapper>
        <ListDetailHeader
          list={buildListRow({ kind: 'todo' })}
          onRename={() => {}}
          onChangeKind={() => {}}
          onArchiveToggle={() => {}}
          onDelete={() => {}}
        />
      </Wrapper>
    );
    expect(screen.getByText('Todo')).toHaveAttribute('data-kind', 'todo');
  });
});
