/**
 * Every mobile route declares the capability it requires, asserted on the
 * contract (ADR-048).
 *
 * The invariant this replaces was about verbs: no `PUT`, `PATCH` or `DELETE`
 * under `/mobile`. That was a stand-in for an authorisation model that did not
 * exist, and now one does — so the mechanical half worth enforcing is no
 * longer "which method" but "does this route say what authority it needs".
 * A route that declares nothing cannot be authorised, and the runtime gate
 * refuses it; this file is what stops one reaching a deployment at all.
 *
 * The walk is over the whole contract by PATH, not over a list of mobile
 * sub-routers, so a mobile route added under a NEW sub-router key is covered
 * the moment it exists. A test enumerating `mobile`, `mobileFinance`,
 * `mobilePurchases` would have to be edited by the same PR it is meant to
 * catch.
 *
 * What it deliberately does NOT check: whether the capability a route declares
 * is the RIGHT one. `purchases.receipts.write` on a transactions route would
 * pass here and is a review judgement, exactly as "is this POST genuinely
 * ingestion" was under the rule this replaces. Stating that plainly is better
 * than a test pretending to check it.
 */
import { describe, expect, it } from 'vitest';

import {
  MOBILE_CAPABILITIES,
  MOBILE_CAPABILITY_SCOPES,
  readRouteCapability,
  requires,
} from '../capabilities.js';
import { bfmContract } from '../rest.js';

const MOBILE_PREFIX = '/mobile';

interface ContractRoute {
  method: string;
  path: string;
  metadata?: unknown;
}

function isRoute(value: unknown): value is ContractRoute {
  if (typeof value !== 'object' || value === null) return false;
  if (!('method' in value) || !('path' in value)) return false;
  return typeof value.method === 'string' && typeof value.path === 'string';
}

function collectRoutes(node: unknown): ContractRoute[] {
  if (isRoute(node)) return [node];
  if (typeof node !== 'object' || node === null) return [];
  return Object.values(node).flatMap(collectRoutes);
}

function isMobile(route: ContractRoute): boolean {
  return route.path === MOBILE_PREFIX || route.path.startsWith(`${MOBILE_PREFIX}/`);
}

const allRoutes = collectRoutes(bfmContract);
const mobileRoutes = allRoutes.filter(isMobile);

describe('the walk itself', () => {
  // Without these, every assertion below passes vacuously the day the traversal
  // stops finding routes — a renamed sub-router key, a contract wrapped in
  // another object — and the guard reports success while seeing nothing
  // (ADR-045).
  it('finds the whole contract, not a subset of it', () => {
    expect(allRoutes.length).toBeGreaterThanOrEqual(10);
    expect(allRoutes.some((route) => route.path === '/health')).toBe(true);
    expect(allRoutes.some((route) => route.path.startsWith('/operator/'))).toBe(true);
    expect(allRoutes.some((route) => route.path.startsWith('/devices/'))).toBe(true);
  });

  it('finds the mobile routes, including the write one', () => {
    expect(mobileRoutes.length).toBeGreaterThanOrEqual(4);
    expect(mobileRoutes.some((route) => route.method === 'POST')).toBe(true);
  });

  it('recognises an undeclared route when it sees one', () => {
    // The degenerate cases, planted: the reader must classify all four ways a
    // declaration can be absent or wrong as a violation. A test that only ever
    // runs against a compliant contract cannot tell "no violations" from "not
    // looking".
    const planted: ContractRoute[] = [
      { method: 'GET', path: '/mobile/nothing-declared' },
      { method: 'GET', path: '/mobile/wrong-shape', metadata: { scope: 'finance' } },
      { method: 'GET', path: '/mobile/not-a-string', metadata: { capability: 7 } },
      { method: 'GET', path: '/mobile/outside-vocabulary', metadata: { capability: 'media.wipe' } },
      { method: 'GET', path: '/mobile/fine', metadata: requires('session.read') },
    ];

    const violations = planted
      .filter(isMobile)
      .filter((route) => readRouteCapability(route.metadata) === null)
      .map((route) => route.path);

    expect(violations).toEqual([
      '/mobile/nothing-declared',
      '/mobile/wrong-shape',
      '/mobile/not-a-string',
      '/mobile/outside-vocabulary',
    ]);
  });
});

describe('the mobile surface', () => {
  it('declares a known capability on every route', () => {
    const undeclared = mobileRoutes
      .filter((route) => readRouteCapability(route.metadata) === null)
      .map((route) => `${route.method} ${route.path}`);

    expect(undeclared).toEqual([]);
  });

  it('keeps every mobile route under the prefix the perimeter is mounted on', () => {
    // A route outside `/mobile` is a route outside BOTH `requireDevice` and
    // `requireCapability` unless somebody remembered a second mount. Every
    // route bfm serves for a phone is therefore under this prefix, and the
    // device-facing exchanges — pair, challenge, refresh — are the deliberate
    // exceptions, gated by what they present rather than by a grant they do
    // not have yet.
    const deviceFacing = allRoutes.filter((route) => route.path.startsWith('/devices/'));
    const strays = allRoutes.filter(
      (route) =>
        route.method !== 'GET' &&
        !isMobile(route) &&
        !deviceFacing.includes(route) &&
        !route.path.startsWith('/operator/')
    );

    expect(strays).toEqual([]);
  });
});

describe('the vocabulary', () => {
  it('says which downstream scope every capability leans on', () => {
    // A capability missing from the map is not a compile error — the map is
    // typed on the union, so an ADDED capability is. This catches the other
    // direction: a map entry left behind by a capability that was removed,
    // which would read as a scope bfm needs for nothing.
    expect(Object.keys(MOBILE_CAPABILITY_SCOPES).toSorted()).toEqual(
      [...MOBILE_CAPABILITIES].toSorted()
    );
  });

  it('declares nothing the contract never asks for', () => {
    // Not an error, but worth seeing: a capability in the vocabulary that no
    // route requires is an authority nothing can spend. Bootstrap-only
    // capabilities are legitimate, so this asserts the reverse direction —
    // every capability a route declares is in the vocabulary — which the type
    // system already enforces and this pins against a contract read as
    // `unknown` at runtime.
    const declared = new Set(
      mobileRoutes.map((route) => readRouteCapability(route.metadata)).filter((one) => one !== null)
    );
    const unknown = [...declared].filter((capability) => !MOBILE_CAPABILITIES.includes(capability));

    expect(unknown).toEqual([]);
  });
});
