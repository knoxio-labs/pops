import { expect, it } from 'vitest';

import {
  proveScriptBrowserEndpoint,
  validateScriptBrowserEndpoint,
} from '../tests/script-browser-endpoint';

it.each([
  'ws://other.test:1234/devtools/browser/id',
  'ws://127.0.0.1:9999/devtools/browser/id',
  'wss://127.0.0.1:1234/devtools/browser/id',
  'ws://127.0.0.1:1234/devtools/page/id',
  'ws://127.0.0.1:1234/devtools/browser/id?other=true',
])('rejects endpoint discovery outside the owned loopback browser address: %s', (endpoint) => {
  expect(() => validateScriptBrowserEndpoint({ webSocketDebuggerUrl: endpoint }, 1234)).toThrow();
});

it('proves a marker using a real response and removes temporary listeners', async () => {
  const socket = new EventTarget();
  const sent: string[] = [];
  const wire = Object.assign(socket, { send: (data: string) => sent.push(data) });
  const proof = proveScriptBrowserEndpoint(wire, 'owned');
  expect(sent).toEqual([JSON.stringify({ id: 1, method: 'Target.getBrowserContexts' })]);
  socket.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({ id: 1, result: { browserContextIds: ['owned'] } }),
    })
  );
  await proof;
  socket.dispatchEvent(new Event('close'));
});

it.each(['close', 'error'])('rejects ownership setup when its socket emits %s', async (type) => {
  const socket = new EventTarget();
  const proof = proveScriptBrowserEndpoint(
    Object.assign(socket, { send: () => undefined }),
    'owned'
  );
  socket.dispatchEvent(new Event(type));
  await expect(proof).rejects.toThrow('ownership proof');
});
