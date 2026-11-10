import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { captureOwner } from './capture-context-fixture';

let owner: Awaited<ReturnType<typeof captureOwner>>;
beforeEach(async () => {
  owner = await captureOwner();
});
afterEach(async () => {
  cleanup();
  await owner.close();
});

it('does not retarget the mounted context unknown request when its generated client origin mutates', async () => {
  owner.loseNextWrite();
  const originalOrigin = owner.client.getConfig().baseUrl;
  owner.mount();
  const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: 'Capture text' }), '  Owner A 東京  ');
  await user.click(screen.getByRole('button', { name: 'Capture' }));
  expect(await screen.findByRole('button', { name: 'Retry Capture' })).toBeVisible();
  const original = owner.requests.filter((request) => request.method === 'POST');
  expect(original).toHaveLength(1);
  owner.client.setConfig({ baseUrl: owner.alternateClient.getConfig().baseUrl });
  await user.click(screen.getByRole('button', { name: 'Retry Capture' }));
  expect(
    within(await screen.findByRole('region', { name: 'Capture failed' })).getByText(
      'Restore the original Trips owner before retrying this operation.'
    )
  ).toBeVisible();
  expect(owner.requests.filter((request) => request.method === 'POST')).toEqual(original);
  expect(screen.getByRole('textbox', { name: 'Capture text' })).toHaveValue('  Owner A 東京  ');
  owner.client.setConfig({ baseUrl: originalOrigin });
  await user.click(screen.getByRole('button', { name: 'Retry Capture' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry Capture' })).not.toBeInTheDocument()
  );
  const posts = owner.requests.filter((request) => request.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
});
