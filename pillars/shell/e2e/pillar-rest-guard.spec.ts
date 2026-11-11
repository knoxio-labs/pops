import { createServer } from 'node:http';

import { expect, test } from './fixtures/pillar-rest-guard';
import { observeMainFrameScripts } from './fixtures/script-requests';

import type { ServerResponse } from 'node:http';

import type { Request, Route } from '@playwright/test';

test('settles only abandoned main-frame scripts across document replacement', async ({
  page,
  scriptBrowser,
}) => {
  const scripts = await observeMainFrameScripts(
    page,
    scriptBrowser.transport.observations,
    () => undefined
  );
  const held = new Map<ServerResponse, string>();
  const finished = new Set<Request>();
  page.on('requestfinished', (request) => finished.add(request));
  let childRoute: Route | undefined;
  const server = createServer((request, response) => {
    const path = request.url ?? '';
    if (path === '/redirect') {
      response.writeHead(302, { location: '/new' });
      response.end();
    } else if (path === '/old' || path === '/new') {
      const kind = path.slice(1);
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<script>
        fetch('/trips-api/${kind}-read', { keepalive: true }).then(response => response.text());
        fetch('/trips-api/${kind}-write', { method: 'POST', keepalive: true }).then(response => response.text());
      </script>${kind === 'new' ? '<iframe src="https://iframe.example/child"></iframe>' : ''}
      <script src="/shared.js"></script>`);
    } else held.set(response, path);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing fixture address');
  const origin = `http://127.0.0.1:${address.port}`;
  await page.route(`${origin}/trips-api/**`, (route) => route.continue());
  await page.route('https://iframe.example/child', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<script src="/child.js"></script>' })
  );
  await page.route('https://iframe.example/child.js', (route) => {
    childRoute = route;
  });
  const waitForRequests = (kind: string) =>
    Promise.all([
      page.waitForRequest(`${origin}/shared.js`),
      page.waitForRequest(`${origin}/trips-api/${kind}-read`),
      page.waitForRequest(`${origin}/trips-api/${kind}-write`),
    ]);
  try {
    const firstRequests = waitForRequests('old');
    await page.goto(`${origin}/old`, { waitUntil: 'commit' });
    const previous = await firstRequests;
    await expect.poll(() => scripts.requests.pending().length).toBe(1);
    const oldId = scripts.requests.pending()[0]?.requestId;
    await page.evaluate(() => history.pushState({}, '', '#same-document'));
    expect(scripts.requests.pending().map((request) => request.requestId)).toEqual([oldId]);
    await expect.poll(() => held.size).toBe(3);
    for (const [response, path] of held) if (path.startsWith('/trips-api/')) response.end();
    await Promise.all(
      previous.slice(1).map(async (request) => {
        const response = await request.response();
        expect(await response?.finished()).toBeNull();
      })
    );
    const nextRequests = waitForRequests('new');
    const childRequest = page.waitForRequest('https://iframe.example/child.js');
    await page.goto(`${origin}/redirect`, { waitUntil: 'commit' });
    const current = await nextRequests;
    const child = await childRequest;
    await expect
      .poll(() => scripts.requests.pending().map((request) => request.requestId))
      .not.toContain(oldId);
    expect(scripts.requests.pending()).toHaveLength(1);
    expect(scripts.requests.pending()[0]?.url).toBe(`${origin}/shared.js`);
    expect([...current, child].some((request) => finished.has(request))).toBe(false);
    await expect.poll(() => childRoute !== undefined).toBe(true);
    await expect.poll(() => held.size).toBe(6);
    if (childRoute === undefined) throw new Error('Missing iframe script');
    await childRoute.fulfill({ contentType: 'application/javascript', body: '' });
    for (const response of held.keys()) if (!response.writableEnded) response.end();
    await Promise.all(
      [...current, child].map(async (request) => {
        const response = await request.response();
        expect(response).not.toBeNull();
        expect(await response?.finished()).toBeNull();
      })
    );
  } finally {
    await scripts.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test.describe('Pillar REST guard', () => {
  test.use({
    expectedUnroutedPillarRestCalls: [
      { method: 'GET', pathAndQuery: '/finance-api/__e2e__/late-request' },
    ],
  });

  test('catches a late request after page routes are cleared', async ({ page }) => {
    await page.route('**/__e2e__/rest-guard', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      })
    );
    await page.goto('/__e2e__/rest-guard');

    await page.route('**/finance-api/__e2e__/stubbed', (route) => route.fulfill({ status: 204 }));
    const stubbedStatus = await page.evaluate(
      async () => (await fetch('/finance-api/__e2e__/stubbed')).status
    );
    expect(stubbedStatus).toBe(204);

    await page.unrouteAll();

    const lateResponse = await page.evaluate(async () => {
      const response = await fetch('/finance-api/__e2e__/late-request');
      return { status: response.status, body: await response.json() };
    });
    expect(lateResponse.status).toBe(599);
    expect(lateResponse.body).toMatchObject({ error: 'unstubbed-pillar-rest-call' });
  });
});
