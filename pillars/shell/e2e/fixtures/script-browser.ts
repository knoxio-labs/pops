import { mkdtemp, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { ScriptCdpTransport } from '../../src/tests/cdp-script-transport';
import { closeScriptBrowserResources } from '../../src/tests/script-browser-cleanup';
import {
  openScriptBrowserSocket,
  proveScriptBrowserEndpoint,
  validateScriptBrowserEndpoint,
} from '../../src/tests/script-browser-endpoint';

import type { Browser, BrowserType, LaunchOptions } from '@playwright/test';

/** Worker-scoped browser and its sole script observation stream. */
export interface ScriptBrowser {
  readonly browser: Browser;
  readonly transport: ScriptCdpTransport;
  readonly close: () => Promise<void>;
}

async function debugPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  if (address === null || typeof address === 'string')
    throw new Error('Missing browser debug port');
  return address.port;
}

/**
 * Keep ordinary Chromium launch options and normal Playwright context/page fixtures.
 * The launcher owns no Playwright contexts; endpoint ownership is proven with a
 * disposable zero-page protocol marker before the sole observing client attaches.
 */
export async function createScriptBrowser(
  browserType: Pick<BrowserType, 'launch' | 'connectOverCDP'>,
  launchOptions: LaunchOptions
): Promise<ScriptBrowser> {
  if (
    launchOptions.args?.some((argument) =>
      /^--remote-debugging-(port|address)(?:=|$)/u.test(argument)
    )
  )
    throw new Error('Script browser debug endpoint must be owned by the fixture');
  const port = await debugPort();
  const launcher = await browserType.launch({
    ...launchOptions,
    args: [
      ...(launchOptions.args ?? []),
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
    ],
  });
  let browser: Browser | undefined;
  let socket: WebSocket | undefined;
  try {
    if (launcher.contexts().length !== 0)
      throw new Error('Script browser launcher must own no Playwright contexts');
    const proof = await launcher.newBrowserCDPSession();
    try {
      const { browserContextId } = z
        .object({ browserContextId: z.string() })
        .parse(await proof.send('Target.createBrowserContext', { disposeOnDetach: true }));
      try {
        const discovery = await fetch(`http://127.0.0.1:${port}/json/version/`);
        if (!discovery.ok) throw new Error('Browser endpoint discovery failed');
        socket = await openScriptBrowserSocket(
          validateScriptBrowserEndpoint(await discovery.json(), port)
        );
        await proveScriptBrowserEndpoint(socket, browserContextId);
      } finally {
        await proof.send('Target.disposeBrowserContext', { browserContextId });
      }
    } finally {
      await proof.detach();
    }
    if (!socket) throw new Error('Browser endpoint proof produced no connection');
    const wire = socket;
    const transport = new ScriptCdpTransport({
      send: (data) => wire.send(data),
      close: () => wire.close(),
      onMessage: (listener) => wire.addEventListener('message', (event) => listener(event.data)),
      onClose: (listener) => wire.addEventListener('close', (event) => listener(event.reason)),
      onError: (listener) => wire.addEventListener('error', () => listener()),
    });
    const directory = fileURLToPath(
      new URL('../../../../tmp/shell-script-browser/', import.meta.url)
    );
    await mkdir(directory, { recursive: true });
    browser = await browserType.connectOverCDP(transport, {
      artifactsDir: await mkdtemp(join(directory, 'worker-')),
      ...(launchOptions.downloadsPath === undefined
        ? {}
        : { downloadsPath: launchOptions.downloadsPath }),
      ...(launchOptions.tracesDir === undefined ? {} : { tracesDir: launchOptions.tracesDir }),
      ...(launchOptions.slowMo === undefined ? {} : { slowMo: launchOptions.slowMo }),
    });
    if (launcher.contexts().length !== 0)
      throw new Error('Launcher acquired a competing Playwright context');
    const connected = browser;
    return {
      browser: connected,
      transport,
      close: async () =>
        closeScriptBrowserResources({
          connected: () => connected.close(),
          wire: () => wire.close(),
          launcher: () => launcher.close(),
        }),
    };
  } catch (error) {
    const connected = browser;
    const wire = socket;
    try {
      await closeScriptBrowserResources({
        ...(connected ? { connected: () => connected.close() } : {}),
        ...(wire ? { wire: () => wire.close() } : {}),
        launcher: () => launcher.close(),
      });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Script browser setup and cleanup failed', {
        cause: cleanupError,
      });
    }
    throw error;
  }
}
