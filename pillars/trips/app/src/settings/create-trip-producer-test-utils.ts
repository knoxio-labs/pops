import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { z } from 'zod';

import { createClient } from '../trips-api/client';

/** Reuse the existing empty owning SQLite/HTTP fixture; no itinerary or parallel producer is introduced. */
export async function creationProducer() {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', resolve('../src/api/__tests__/capture-source.fixture.ts')],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );
  const lines = createInterface({ input: child.stdout });
  const close = async (): Promise<void> => {
    lines.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  };
  try {
    const [line] = await Promise.race([
      once(lines, 'line'),
      once(child, 'exit').then(() => {
        throw new Error('Creation producer exited before ready');
      }),
    ]);
    const { origin, tripId } = z
      .object({ origin: z.url(), tripId: z.number().int().positive() })
      .parse(JSON.parse(String(line)));
    const recording = creationRecorder();
    return {
      origin,
      tripId,
      close,
      requests: recording.requests,
      lose: recording.lose,
      client: createClient({
        baseUrl: origin,
        headers: { 'x-api-key': 'fixture' },
        fetch: recording.fetch,
      }),
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function creationRecorder() {
  let lose = false;
  const requests: { url: string; body: string }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const creating =
      request.method === 'POST' && new URL(request.url).pathname === '/trips/operations';
    if (creating) requests.push({ url: request.url, body: await request.clone().text() });
    const response = await fetch(request);
    if (creating && lose && response.status === 201) {
      lose = false;
      await response.arrayBuffer();
      throw new TypeError('Creation acknowledgement lost after server commit');
    }
    return response;
  };
  return {
    requests,
    fetch: transport,
    lose: (): void => {
      lose = true;
    },
  };
}
