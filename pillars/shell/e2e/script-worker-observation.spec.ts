import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures/pillar-rest-guard';
import { observeMainFrameScripts } from './fixtures/script-requests';
import { latch, listen } from './fixtures/script-worker-server';

import type { ServerResponse } from 'node:http';

test('owns early and nested imports behind both real setup ACKs with normal context fidelity', async ({
  page,
  context,
  scriptBrowser,
}, testInfo) => {
  const networkSeen = latch(),
    recursiveSeen = latch(),
    networkRelease = latch(),
    recursiveRelease = latch(),
    childSeen = latch();
  let rootSession: string | undefined;
  let child: ServerResponse | undefined;
  let nestedArrivals = 0;
  const scripts = await observeMainFrameScripts(
    page,
    scriptBrowser.transport.observations,
    () => undefined
  );
  scriptBrowser.transport.beforeWorkerReply = async (command) => {
    if (!command.sessionId) return;
    rootSession ??= command.sessionId;
    if (command.sessionId !== rootSession) return;
    if (command.method === 'Network.enable') {
      networkSeen.complete();
      await networkRelease.promise;
    }
    if (command.method === 'Target.setAutoAttach') {
      recursiveSeen.complete();
      await recursiveRelease.promise;
    }
  };
  const server = await listen((request, response) => {
    response.setHeader('content-type', 'text/javascript');
    if (request.url === '/root.js')
      response.end(
        'const nested=new Worker("/nested.js",{type:"module"});nested.onmessage=()=>self.postMessage("ready");'
      );
    else if (request.url === '/nested.js') {
      nestedArrivals++;
      response.end('await import("/child.js");self.postMessage("ready");');
    } else if (request.url === '/child.js') {
      child = response;
      childSeen.complete();
    } else if (request.url === '/download') {
      response.setHeader('content-disposition', 'attachment; filename=proof.txt');
      response.end('download proof');
    } else {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<button>Start worker</button><output>waiting</output><a href="/download">Download</a><script>document.querySelector("button").onclick=()=>{const worker=new Worker("/root.js",{type:"module"});worker.onmessage=()=>document.querySelector("output").textContent="ready";};</script>'
      );
    }
  });
  try {
    await context.tracing.start({ screenshots: true, snapshots: true });
    await page.route('**/routed', (route) => route.fulfill({ body: 'route proof' }));
    await page.goto(server.origin);
    expect(await page.evaluate(async () => (await fetch('/routed')).text())).toBe('route proof');
    expect(page.viewportSize()).toEqual(
      testInfo.project.use.viewport ?? { width: 1280, height: 720 }
    );
    if (testInfo.project.use.locale)
      expect(await page.evaluate(() => navigator.language)).toBe(testInfo.project.use.locale);
    await page.getByRole('button', { name: 'Start worker' }).click();
    await Promise.all([networkSeen.promise, recursiveSeen.promise]);
    expect(nestedArrivals).toBe(0);
    networkRelease.complete();
    // A subsequent real reply is delivered while the recursive ACK remains held.
    await page.title();
    expect(nestedArrivals).toBe(0);
    recursiveRelease.complete();
    await childSeen.promise;
    await expect
      .poll(() =>
        scripts.requests.pending().some((request) => request.url === `${server.origin}/child.js`)
      )
      .toBe(true);
    if (!child) throw new Error('Missing held import');
    child.end('export const ready=true;');
    await expect(page.locator('output')).toHaveText('ready');
    await expect.poll(() => scripts.requests.pending()).toEqual([]);
    scripts.requests.assertHealthy();
    const downloadStarted = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download' }).click();
    const download = await downloadStarted;
    const path = testInfo.outputPath('download.txt');
    await download.saveAs(path);
    expect(await readFile(path, 'utf8')).toBe('download proof');
    await context.tracing.stop({ path: testInfo.outputPath('trace.zip') });
  } finally {
    scriptBrowser.transport.beforeWorkerReply = undefined;
    networkRelease.complete();
    recursiveRelease.complete();
    scripts.dispose();
    await server.close();
  }
});

for (const separateContext of [false, true]) {
  test(`isolates same-URL workers across pages with ${separateContext ? 'separate' : 'shared'} contexts`, async ({
    page,
    browser,
    scriptBrowser,
  }) => {
    const held: ServerResponse[] = [];
    const requested = latch();
    const server = await listen((request, response) => {
      if (request.url === '/child.js') {
        held.push(response);
        if (held.length === 2) requested.complete();
      } else if (request.url === '/worker.js') {
        response.setHeader('content-type', 'text/javascript');
        response.end('await import("/child.js");self.postMessage("ready");');
      } else {
        response.setHeader('content-type', 'text/html');
        response.end(
          '<output>waiting</output><script>const w=new Worker("/worker.js",{type:"module"});w.onmessage=()=>document.querySelector("output").textContent="ready";</script>'
        );
      }
    });
    const otherContext = separateContext ? await browser.newContext() : page.context();
    const other = await otherContext.newPage();
    const first = await observeMainFrameScripts(
      page,
      scriptBrowser.transport.observations,
      () => undefined
    );
    const second = await observeMainFrameScripts(
      other,
      scriptBrowser.transport.observations,
      () => undefined
    );
    try {
      await Promise.all([page.goto(server.origin), other.goto(server.origin)]);
      await requested.promise;
      await expect.poll(() => first.requests.pending().length).toBeGreaterThan(0);
      await expect.poll(() => second.requests.pending().length).toBeGreaterThan(0);
      held[0]?.setHeader('content-type', 'text/javascript');
      held[0]?.end('export const ready=true;');
      await expect
        .poll(
          () =>
            [first.requests.pending().length, second.requests.pending().length].filter(
              (count) => count === 0
            ).length
        )
        .toBe(1);
      held[1]?.setHeader('content-type', 'text/javascript');
      held[1]?.end('export const ready=true;');
      await expect
        .poll(() => [...first.requests.pending(), ...second.requests.pending()])
        .toEqual([]);
      first.requests.assertHealthy();
      second.requests.assertHealthy();
    } finally {
      first.dispose();
      second.dispose();
      if (separateContext) await otherContext.close();
      else await other.close();
      await server.close();
    }
  });
}

test('settles completed blob workers and preserves main-document retirement during navigation', async ({
  page,
  scriptBrowser,
}) => {
  const held = new Map<string, ServerResponse>();
  const server = await listen((request, response) => {
    const path = request.url ?? '';
    if (path.endsWith('.js')) {
      held.set(path, response);
      return;
    }
    const name = path === '/new' ? 'new' : 'old';
    response.setHeader('content-type', 'text/html');
    response.end(
      `<output>waiting</output><script>const w=new Worker(URL.createObjectURL(new Blob(['self.postMessage("ready");'],{type:'text/javascript'})),{type:'module'});w.onmessage=()=>document.querySelector('output').textContent='ready';</script><script src="/${name}.js"></script>`
    );
  });
  const scripts = await observeMainFrameScripts(
    page,
    scriptBrowser.transport.observations,
    () => undefined
  );
  try {
    await page.goto(`${server.origin}/old`, { waitUntil: 'commit' });
    await expect(page.locator('output')).toHaveText('ready');
    await expect
      .poll(() => scripts.requests.pending().map((request) => request.url))
      .toEqual([`${server.origin}/old.js`]);
    await page.evaluate(() => history.pushState({}, '', '#same-document'));
    expect(scripts.requests.pending()).toHaveLength(1);
    await page.goto(`${server.origin}/new`, { waitUntil: 'commit' });
    await expect(page.locator('output')).toHaveText('ready');
    await expect
      .poll(() => scripts.requests.pending().map((request) => request.url))
      .toEqual([`${server.origin}/new.js`]);
    const response = held.get('/new.js');
    if (!response) throw new Error('Missing current script');
    response.end('');
    await expect.poll(() => scripts.requests.pending()).toEqual([]);
    scripts.requests.assertHealthy();
  } finally {
    scripts.dispose();
    await server.close();
  }
});
