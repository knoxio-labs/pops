import type { Page } from '@playwright/test';

import type {
  PageScriptObservation,
  ScriptObservations,
} from '../../src/tests/cdp-script-observation';

/** Bind a page to the browser's sole script stream through public target/context metadata. */
export async function observeMainFrameScripts(
  page: Page,
  observations: ScriptObservations,
  changed: () => void
): Promise<{ requests: PageScriptObservation; dispose: () => void }> {
  const session = await page.context().newCDPSession(page);
  try {
    const { targetInfo } = await session.send('Target.getTargetInfo');
    const requests = observations.observe(targetInfo, changed);
    return { requests, dispose: requests.dispose };
  } finally {
    await session.detach();
  }
}
