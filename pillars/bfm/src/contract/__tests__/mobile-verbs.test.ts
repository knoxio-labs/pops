/**
 * The mobile surface is ingestion-only, asserted on the contract (ADR-046).
 *
 * The rule it defends used to be a sentence in a README — "nothing under
 * `/mobile` uses a verb other than `GET`" — which held for as long as everyone
 * who added a route happened to have read it. Receipt capture made it false,
 * and the replacement is narrower rather than looser: a phone may hand over
 * content it captured (`POST`), and may never mutate a record a pillar already
 * holds (`PUT`, `PATCH`, `DELETE`).
 *
 * That half is mechanical, so it is a test rather than a paragraph. The other
 * half — whether a given `POST` is genuinely ingestion — is a review
 * judgement, and this file deliberately does not pretend to check it.
 *
 * The walk is over the whole contract by PATH, not over a list of mobile
 * sub-routers, so a mobile route added under a NEW sub-router key is covered
 * the moment it exists. A test enumerating `mobile`, `mobileFinance`,
 * `mobilePurchases` would have to be edited by the same PR it is meant to
 * catch.
 */
import { describe, expect, it } from 'vitest';

import { bfmContract } from '../rest.js';

const MOBILE_PREFIX = '/mobile';

/** Verbs that mutate something the phone did not create. Permanently refused. */
const FORBIDDEN_MOBILE_METHODS = ['PUT', 'PATCH', 'DELETE'];

interface ContractRoute {
  method: string;
  path: string;
}

function isRoute(value: unknown): value is ContractRoute {
  if (typeof value !== 'object' || value === null) return false;
  if (!('method' in value) || !('path' in value)) return false;
  return typeof value.method === 'string' && typeof value.path === 'string';
}

/** Every route in the contract, however deeply its sub-router is nested. */
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

  it('recognises a forbidden verb when it sees one', () => {
    // The degenerate case, planted: the filter must classify a mutation under
    // `/mobile` as a violation. A test that only ever runs against a compliant
    // contract cannot tell "no violations" from "not looking".
    const planted: ContractRoute[] = [
      { method: 'PATCH', path: '/mobile/finance/transactions/:id' },
      { method: 'DELETE', path: '/mobile/purchases/receipts/:id' },
      { method: 'GET', path: '/mobile/bootstrap' },
      // Not mobile: the operator surface revokes a device, and must stay legal.
      { method: 'DELETE', path: '/operator/devices/:id' },
    ];

    const violations = planted
      .filter(isMobile)
      .filter((route) => FORBIDDEN_MOBILE_METHODS.includes(route.method));

    expect(violations.map((route) => route.path)).toEqual([
      '/mobile/finance/transactions/:id',
      '/mobile/purchases/receipts/:id',
    ]);
  });
});

describe('the mobile surface', () => {
  it('declares no route that mutates a record a pillar already holds', () => {
    const violations = mobileRoutes
      .filter((route) => FORBIDDEN_MOBILE_METHODS.includes(route.method))
      .map((route) => `${route.method} ${route.path}`);

    expect(violations).toEqual([]);
  });

  it('uses only GET and POST', () => {
    expect([...new Set(mobileRoutes.map((route) => route.method))].toSorted()).toEqual([
      'GET',
      'POST',
    ]);
  });

  it('keeps every mobile write under the prefix the perimeter is mounted on', () => {
    // A write outside `/mobile` would be a write outside `requireDevice` unless
    // somebody remembered a second mount. Every POST bfm serves for a phone is
    // therefore under this prefix, and the device-facing exchanges — pair,
    // challenge, refresh — are the deliberate exceptions, gated by what they
    // present rather than by the guard.
    const deviceFacing = allRoutes.filter((route) => route.path.startsWith('/devices/'));
    const otherPosts = allRoutes.filter(
      (route) =>
        route.method === 'POST' &&
        !isMobile(route) &&
        !deviceFacing.includes(route) &&
        !route.path.startsWith('/operator/')
    );

    expect(otherPosts).toEqual([]);
  });
});
