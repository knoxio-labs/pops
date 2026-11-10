import { createServer } from 'node:http';

import {
  openScriptBrowserSocket,
  proveScriptBrowserEndpoint,
  validateScriptBrowserEndpoint,
} from '../src/tests/script-browser-endpoint';
import { expect, test } from './fixtures/pillar-rest-guard';
import { createScriptBrowser } from './fixtures/script-browser';
import { observeMainFrameScripts } from './fixtures/script-requests';
import { latch, listen } from './fixtures/script-worker-server';

import type { ServerResponse } from 'node:http';

import type { Browser } from '@playwright/test';

test('rejects another live browser endpoint before Playwright can attach its targets', async ({
  playwright,
}) => {
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  if (address === null || typeof address === 'string')
    throw new Error('Missing endpoint test port');
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve()))
  );
  const owner = await playwright.chromium.launch({ headless: true });
  const other = await playwright.chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${address.port}`, '--remote-debugging-address=127.0.0.1'],
  });
  const proof = await owner.newBrowserCDPSession();
  let socket: WebSocket | undefined;
  try {
    const marker = await proof.send('Target.createBrowserContext', { disposeOnDetach: true });
    try {
      const discovery = await fetch(`http://127.0.0.1:${address.port}/json/version/`);
      socket = await openScriptBrowserSocket(
        validateScriptBrowserEndpoint(await discovery.json(), address.port)
      );
      await expect(proveScriptBrowserEndpoint(socket, marker.browserContextId)).rejects.toThrow(
        'does not belong'
      );
      expect(owner.contexts()).toEqual([]);
      expect(other.contexts()).toEqual([]);
    } finally {
      await proof.send('Target.disposeBrowserContext', marker);
    }
    expect((await proof.send('Target.getBrowserContexts')).browserContextIds).toEqual([]);
  } finally {
    socket?.close();
    await proof.detach();
    await owner.close();
    await other.close();
  }
});

test('settles a failed worker import only after its real network failure', async ({
  page,
  scriptBrowser,
}) => {
  let child: ServerResponse | undefined;
  const started = latch();
  const server = await listen((request, response) => {
    if (request.url === '/child.js') {
      child = response;
      started.complete();
    } else if (request.url === '/worker.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end('import("/child.js").catch(()=>self.postMessage("failed"));');
    } else {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<output>waiting</output><script>const worker=new Worker("/worker.js",{type:"module"});worker.onmessage=event=>document.querySelector("output").textContent=event.data;</script>'
      );
    }
  });
  const scripts = await observeMainFrameScripts(
    page,
    scriptBrowser.transport.observations,
    () => undefined
  );
  try {
    await page.goto(server.origin);
    await started.promise;
    await expect
      .poll(() =>
        scripts.requests.pending().some((request) => request.url === `${server.origin}/child.js`)
      )
      .toBe(true);
    if (!child) throw new Error('Missing failed import');
    child.writeHead(200, { 'content-type': 'text/javascript', 'content-length': '10000' });
    await new Promise<void>((resolve, reject) =>
      child?.write('export const partial =', (error) => (error ? reject(error) : resolve()))
    );
    child.destroy();
    await expect(page.locator('output')).toHaveText('failed');
    await expect.poll(() => scripts.requests.pending()).toEqual([]);
    scripts.requests.assertHealthy();
  } finally {
    scripts.dispose();
    await server.close();
  }
});

test('reports actual socket loss while worker observation setup is pending', async ({
  playwright,
}) => {
  const owned = await createScriptBrowser(playwright.chromium, { headless: true });
  const context = await owned.browser.newContext();
  const page = await context.newPage();
  const scripts = await observeMainFrameScripts(
    page,
    owned.transport.observations,
    () => undefined
  );
  const held = latch(),
    release = latch();
  owned.transport.beforeWorkerReply = async (command) => {
    if (command.method === 'Network.enable') {
      held.complete();
      await release.promise;
    }
  };
  try {
    await page.evaluate(() => {
      new Worker(
        URL.createObjectURL(new Blob(['self.postMessage("ready");'], { type: 'text/javascript' })),
        { type: 'module' }
      );
    });
    await held.promise;
    const disconnected = new Promise<void>((resolve) =>
      owned.browser.once('disconnected', () => resolve())
    );
    owned.transport.close();
    await disconnected;
    expect(() => scripts.requests.assertHealthy()).toThrow('Browser script observation failed');
    await expect(page.title()).rejects.toThrow(/closed/);
  } finally {
    release.complete();
    scripts.dispose();
    await owned.close();
  }
});

test('cannot treat target termination during startup as a completed script', async ({
  playwright,
}) => {
  const owned = await createScriptBrowser(playwright.chromium, { headless: true });
  const context = await owned.browser.newContext();
  const page = await context.newPage();
  const scripts = await observeMainFrameScripts(
    page,
    owned.transport.observations,
    () => undefined
  );
  const held = latch(),
    release = latch();
  owned.transport.beforeWorkerReply = async (command) => {
    if (command.method === 'Network.enable') {
      held.complete();
      await release.promise;
    }
  };
  try {
    const worker = await page.evaluateHandle(
      () =>
        new Worker(
          URL.createObjectURL(
            new Blob(['self.postMessage("ready");'], { type: 'text/javascript' })
          ),
          { type: 'module' }
        )
    );
    await held.promise;
    await worker.evaluate((value) => value.terminate());
    await expect
      .poll(() => {
        try {
          scripts.requests.assertHealthy();
          return false;
        } catch {
          return true;
        }
      })
      .toBe(true);
    release.complete();
    expect(() => scripts.requests.assertHealthy()).toThrow();
  } finally {
    release.complete();
    scripts.dispose();
    await owned.close();
  }
});

test('closes its owned launcher after endpoint setup fails', async ({ playwright }) => {
  const originalFetch = globalThis.fetch;
  let launcher: Browser | undefined;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/wrong' })
    );
  try {
    await expect(
      createScriptBrowser(
        {
          launch: async (options) => {
            launcher = await playwright.chromium.launch(options);
            return launcher;
          },
          connectOverCDP: playwright.chromium.connectOverCDP.bind(playwright.chromium),
        },
        { headless: true }
      )
    ).rejects.toThrow('outside the launched browser address');
    expect(launcher).toBeDefined();
    expect(launcher?.isConnected()).toBe(false);
    expect(launcher?.contexts()).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
    await launcher?.close();
  }
});
