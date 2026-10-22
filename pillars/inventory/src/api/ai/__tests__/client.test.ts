/**
 * Unit tests for {@link createAiClient} driven against a hand-built stub of
 * the `ai` pillar handle. Every path short of a usable answer — no key, a
 * rejected credential, a failed or timed-out call — degrades to `undefined`
 * so `codes/suggest` falls back to deterministic numbering.
 */
import { describe, expect, it, vi } from 'vitest';

import { createAiClient } from '../client.js';
import { ok, stubAiHandle, unauthorized, unavailable } from './stub-handle.js';

import type { CodeSuggestionContext } from '../../sync/code-context.js';

const CONTEXT: CodeSuggestionContext = {
  item: { name: 'Office 5', typeKey: 'storage_box', typeLabel: 'Storage box' },
  destination: { path: ['Home', 'Office'], container: { name: 'Shelves', code: 'SHELVES-1' } },
  existing: [{ code: 'BOX-OFFICE-4', name: 'Office 4', typeKey: 'storage_box', place: 'Office' }],
  stem: 'BOX-',
};

function answering(codes: string[]) {
  return vi.fn(async () =>
    ok({ data: { suggestions: codes.map((code) => ({ code, reason: 'r' })) } })
  );
}

describe('createAiClient.suggestCodes', () => {
  it('returns undefined when this process holds no service-account key', async () => {
    const client = createAiClient(() => null);

    expect(await client.suggestCodes(CONTEXT, 3)).toBeUndefined();
  });

  it('sends the whole context and count, and returns the codes in order', async () => {
    const suggest = answering(['BOX-OFFICE-5', 'BOX-HOME-1']);
    const client = createAiClient(() => stubAiHandle(suggest));

    const result = await client.suggestCodes(CONTEXT, 3);

    expect(result).toEqual(['BOX-OFFICE-5', 'BOX-HOME-1']);
    expect(suggest).toHaveBeenCalledWith({
      item: { name: 'Office 5', typeKey: 'storage_box', typeLabel: 'Storage box' },
      destination: { path: ['Home', 'Office'], container: { name: 'Shelves', code: 'SHELVES-1' } },
      existing: [
        { code: 'BOX-OFFICE-4', name: 'Office 4', typeKey: 'storage_box', place: 'Office' },
      ],
      stem: 'BOX-',
      count: 3,
    });
  });

  it('omits destination and stem when the context has none', async () => {
    const suggest = answering(['A-1']);
    const client = createAiClient(() => stubAiHandle(suggest));

    await client.suggestCodes({ item: { name: 'Lamp' }, existing: [] }, 2);

    expect(suggest).toHaveBeenCalledWith({ item: { name: 'Lamp' }, existing: [], count: 2 });
  });

  it('degrades to undefined when the ai pillar answers not-ok', async () => {
    const client = createAiClient(() => stubAiHandle(async () => unavailable()));

    expect(await client.suggestCodes(CONTEXT, 3)).toBeUndefined();
  });

  it('degrades to undefined and logs distinctly when the credential is rejected', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createAiClient(() => stubAiHandle(async () => unauthorized('nope')));

    expect(await client.suggestCodes(CONTEXT, 3)).toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('rejected'));
    error.mockRestore();
  });

  it('degrades to undefined when the call throws (e.g. a timeout)', async () => {
    const client = createAiClient(() => stubAiHandle(() => Promise.reject(new Error('timeout'))));

    expect(await client.suggestCodes(CONTEXT, 3)).toBeUndefined();
  });
});
