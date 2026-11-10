import { MainFrameScriptRequests } from '../../src/tests/script-request-tracker';

import type { Page } from '@playwright/test';

/**
 * Observe the configured Chromium page's main-frame scripts through public CDP identities.
 * Disposal tolerates a target that closed during teardown without hiding other detach errors.
 */
export async function observeMainFrameScripts(
  page: Page,
  changed: () => void
): Promise<{ requests: MainFrameScriptRequests; dispose: () => Promise<void> }> {
  const session = await page.context().newCDPSession(page);
  let closed = false;
  session.on('close', () => {
    closed = true;
  });
  const requests = new MainFrameScriptRequests(await session.send('Page.getFrameTree'));
  const notify = (didChange: boolean): void => {
    if (didChange) changed();
  };
  session.on('Network.requestWillBeSent', (event: unknown) => notify(requests.started(event)));
  session.on('Network.loadingFinished', (event: unknown) => notify(requests.settled(event)));
  session.on('Network.loadingFailed', (event: unknown) => notify(requests.settled(event)));
  session.on('Page.frameNavigated', (event: unknown) => notify(requests.navigated(event)));
  await session.send('Network.enable');
  await session.send('Page.enable');
  return {
    requests,
    dispose: async () => {
      if (closed || page.isClosed()) return;
      try {
        await session.detach();
      } catch (error) {
        if (!closed && !page.isClosed()) throw error;
      }
    },
  };
}
