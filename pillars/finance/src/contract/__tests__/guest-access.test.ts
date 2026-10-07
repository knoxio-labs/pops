/**
 * Which finance pages and nav items a guest may open (POPS-5873).
 *
 * The lists are spelled out rather than derived: the mark is the whole of what
 * decides whether the shell shows a guest a page, so a page gaining or losing
 * it has to be a visible diff here. Every page not named below is
 * operator-only, and the full path list is pinned so a new page cannot arrive
 * already marked without this file changing.
 */
import { describe, expect, it } from 'vitest';

import { FINANCE_NAV } from '../nav.js';
import { FINANCE_PAGES } from '../pages.js';

function accessOf(entry: object): unknown {
  return 'access' in entry ? entry.access : undefined;
}

describe('finance guest access', () => {
  it('marks exactly the accounts list, an account and transactions as guest pages', () => {
    const marked = FINANCE_PAGES.filter((page) => accessOf(page) !== undefined).map((page) => ({
      path: page.path,
      access: accessOf(page),
    }));

    expect(marked).toEqual([
      { path: 'transactions', access: 'guest' },
      { path: 'accounts', access: 'guest' },
      { path: 'accounts/:id', access: 'guest' },
    ]);
  });

  it('leaves every other page unmarked, so operator-only', () => {
    const unmarked = FINANCE_PAGES.filter((page) => accessOf(page) === undefined).map(
      (page) => page.path
    );

    expect(unmarked).toEqual([
      '',
      'entities',
      'entities/:id',
      'accounts/:id/checkpoints',
      'accounts/:id/imports',
      'budgets',
      'wishlist',
      'import',
      'rules',
      'tag-rules',
      'prompts',
      'settings',
    ]);
  });

  it('marks exactly the accounts and transactions nav items', () => {
    const marked = FINANCE_NAV.items
      .filter((item) => accessOf(item) !== undefined)
      .map((item) => ({ path: item.path, access: accessOf(item) }));

    expect(marked).toEqual([
      { path: '/transactions', access: 'guest' },
      { path: '/accounts', access: 'guest' },
    ]);
  });

  it('leaves every other nav item unmarked, so operator-only', () => {
    const unmarked = FINANCE_NAV.items
      .filter((item) => accessOf(item) === undefined)
      .map((item) => item.path);

    expect(unmarked).toEqual([
      '',
      '/entities',
      '/budgets',
      '/wishlist',
      '/import',
      '/rules',
      '/tag-rules',
      '/prompts',
      '/settings',
    ]);
  });

  it('marks no nav item whose page a guest may not open', () => {
    const guestPagePaths = new Set(
      FINANCE_PAGES.filter((page) => accessOf(page) === 'guest').map((page) => `/${page.path}`)
    );
    const guestNavPaths = FINANCE_NAV.items
      .filter((item) => accessOf(item) === 'guest')
      .map((item) => item.path);

    for (const path of guestNavPaths) expect(guestPagePaths.has(path)).toBe(true);
  });
});
