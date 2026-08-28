/**
 * The SDK's default `fetch`, safe to store on an object and call as a method.
 *
 * In a browser, `fetch` is a method of `Window` and checks its receiver. The
 * SDK's transports keep an injectable `fetchImpl` on the instance and invoke it
 * as `this.fetchImpl(url, init)` — a method call, so a detached native `fetch`
 * receives the transport as `this` and throws
 * `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`
 * BEFORE issuing any request. `client/discovery.ts` wrapped that failure as a
 * `PillarSdkError`, `safeLookup` swallowed it, and every browser-side SDK call
 * reported the target pillar as `unavailable` with no network activity to
 * explain why.
 *
 * Node's global `fetch` does not check its receiver, so server-side pillar →
 * pillar calls were unaffected and the fault only ever appeared in the shell.
 *
 * Wrapping rather than binding keeps `globalThis.fetch` resolved at call time,
 * so a test that stubs the global still sees its stub, and callers who inject
 * their own `fetchImpl` keep whatever receiver they intended.
 */
export const defaultFetch: typeof fetch = (input, init) => fetch(input, init);
