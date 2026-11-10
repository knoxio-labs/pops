import { expect, it } from 'vitest';

import { closeScriptBrowserResources } from '../tests/script-browser-cleanup';

it('closes wire and launcher even if connected-browser cleanup fails', async () => {
  const calls: string[] = [];
  await expect(
    closeScriptBrowserResources({
      connected: () => {
        calls.push('connected');
        return Promise.reject(new Error('connected failed'));
      },
      wire: () => {
        calls.push('wire');
        throw new Error('wire failed');
      },
      launcher: () => {
        calls.push('launcher');
        return Promise.reject(new Error('launcher failed'));
      },
    })
  ).rejects.toMatchObject({ errors: [expect.any(Error), expect.any(Error), expect.any(Error)] });
  expect(calls).toEqual(['connected', 'wire', 'launcher']);
});
