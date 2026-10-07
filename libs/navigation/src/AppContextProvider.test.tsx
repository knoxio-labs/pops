import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AppContextProvider } from './AppContextProvider';
import { useAppContext, useSetPageContext } from './hooks';

/** Renders children inside a MemoryRouter + AppContextProvider at the given path. */
function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppContextProvider>{ui}</AppContextProvider>
    </MemoryRouter>
  );
}

/** Simple consumer that renders all context fields as testable elements. */
function ContextDisplay() {
  const ctx = useAppContext();
  return (
    <div>
      <span data-testid="app">{ctx.app ?? 'null'}</span>
      <span data-testid="page">{ctx.page ?? 'null'}</span>
      <span data-testid="pageType">{ctx.pageType}</span>
      <span data-testid="entity">{ctx.entity ? ctx.entity.title : 'none'}</span>
    </div>
  );
}

describe('AppContextProvider', () => {
  describe('URL-based app detection', () => {
    it('returns null app at root /', () => {
      renderAt('/', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('null');
    });

    it('detects finance app from /finance', () => {
      renderAt('/finance', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('finance');
    });

    it('detects finance app from a nested path /finance/transactions', () => {
      renderAt('/finance/transactions', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('finance');
    });

    it('detects media app from /media', () => {
      renderAt('/media', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('media');
    });

    it('detects media app from a nested path /media/library/42', () => {
      renderAt('/media/library/42', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('media');
    });

    it('detects inventory app from /inventory', () => {
      renderAt('/inventory', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('inventory');
    });

    it('detects ai app from /ai', () => {
      renderAt('/ai', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('ai');
    });

    it.each([
      ['/food', 'food'],
      ['/food/recipes', 'food'],
      ['/cerebrum', 'cerebrum'],
      ['/cerebrum/memories/abc', 'cerebrum'],
      ['/purchases', 'purchases'],
      ['/purchases/abc', 'purchases'],
    ])('detects %s as the %s app', (path, app) => {
      renderAt(path, <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent(app);
    });

    it('returns null app for an unmatched path', () => {
      renderAt('/unknown', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('null');
    });

    it('does not match /finances as /finance (boundary check)', () => {
      renderAt('/finances', <ContextDisplay />);
      expect(screen.getByTestId('app')).toHaveTextContent('null');
    });
  });

  describe('default context values', () => {
    it('has null page by default', () => {
      renderAt('/finance', <ContextDisplay />);
      expect(screen.getByTestId('page')).toHaveTextContent('null');
    });

    it('has top-level pageType by default', () => {
      renderAt('/finance', <ContextDisplay />);
      expect(screen.getByTestId('pageType')).toHaveTextContent('top-level');
    });

    it('has no entity by default', () => {
      renderAt('/finance', <ContextDisplay />);
      expect(screen.getByTestId('entity')).toHaveTextContent('none');
    });
  });

  describe('navigation updates', () => {
    /** Component that navigates programmatically so we can test context updates. */
    function NavTester() {
      const ctx = useAppContext();
      const navigate = useNavigate();
      return (
        <div>
          <span data-testid="app">{ctx.app ?? 'null'}</span>
          <button onClick={() => navigate('/media')}>go to media</button>
          <button onClick={() => navigate('/')}>go to root</button>
        </div>
      );
    }

    it('updates app when navigating to a different app', async () => {
      render(
        <MemoryRouter initialEntries={['/finance']}>
          <AppContextProvider>
            <NavTester />
          </AppContextProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('app')).toHaveTextContent('finance');

      await act(async () => {
        screen.getByRole('button', { name: 'go to media' }).click();
      });

      expect(screen.getByTestId('app')).toHaveTextContent('media');
    });

    it('resets to null app when navigating to root', async () => {
      render(
        <MemoryRouter initialEntries={['/finance']}>
          <AppContextProvider>
            <NavTester />
          </AppContextProvider>
        </MemoryRouter>
      );

      await act(async () => {
        screen.getByRole('button', { name: 'go to root' }).click();
      });

      expect(screen.getByTestId('app')).toHaveTextContent('null');
    });

    it('keeps the destination page context when navigating between pages', async () => {
      const entity = { uri: 'pops:inventory/item/box-1', type: 'item', title: 'Box' };

      function ContextDisplay() {
        const context = useAppContext();
        return (
          <div>
            <span data-testid="page">{context.page ?? 'null'}</span>
            <span data-testid="entity">{context.entity?.uri ?? 'none'}</span>
          </div>
        );
      }

      function ContainersPage() {
        useSetPageContext({ page: 'containers' });
        const navigate = useNavigate();
        return (
          <>
            <button onClick={() => navigate('/inventory/items/box-1')}>open item</button>
            <ContextDisplay />
          </>
        );
      }

      function ItemDetailPage() {
        useSetPageContext({ page: 'item-detail', pageType: 'drill-down', entity });
        const navigate = useNavigate();
        return (
          <>
            <button onClick={() => navigate('/inventory/overview')}>open overview</button>
            <ContextDisplay />
          </>
        );
      }

      function RouteContextTester() {
        const { pathname } = useLocation();
        if (pathname === '/inventory/items/box-1') return <ItemDetailPage />;
        if (pathname === '/inventory/overview') return <ContextDisplay />;
        return <ContainersPage />;
      }

      render(
        <MemoryRouter initialEntries={['/inventory/containers']}>
          <AppContextProvider>
            <RouteContextTester />
          </AppContextProvider>
        </MemoryRouter>
      );

      expect(screen.getByTestId('page')).toHaveTextContent('containers');

      await act(async () => {
        screen.getByRole('button', { name: 'open item' }).click();
      });

      expect(screen.getByTestId('page')).toHaveTextContent('item-detail');
      expect(screen.getByTestId('entity')).toHaveTextContent('pops:inventory/item/box-1');

      await act(async () => {
        screen.getByRole('button', { name: 'open overview' }).click();
      });

      expect(screen.getByTestId('page')).toHaveTextContent('null');
      expect(screen.getByTestId('entity')).toHaveTextContent('none');
    });
  });
});
