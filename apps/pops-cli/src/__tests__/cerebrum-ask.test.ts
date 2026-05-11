import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runAsk } from '../commands/cerebrum-ask.js';
import { CaptureStream, getFetchJson, mockFetchOk, pipedStdin, ttyStdin } from './test-helpers.js';

describe('runAsk', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prints the answer and citations from a successful response', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    mockFetchOk({
      answer: 'You decided to use LangGraph for routing.',
      sources: [
        { id: 'eng_a', title: 'LangGraph decision', scope: 'work.platform' },
        { id: 'eng_b', title: 'Agent routing notes' },
      ],
      confidence: 'high',
    });

    const code = await runAsk({
      question: 'what did I decide about routing?',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: {},
    });

    expect(code).toBe(0);
    const out = stdout.text();
    expect(out).toContain('You decided to use LangGraph');
    expect(out).toContain('1. LangGraph decision (eng_a) [work.platform]');
    expect(out).toContain('2. Agent routing notes (eng_b)');
    expect(out).toContain('Confidence: high');
  });

  it('rejects empty input with a non-zero exit code', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const fetchSpy = mockFetchOk({ answer: 'should not be called' });

    const code = await runAsk({
      question: '   ',
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: {},
    });

    expect(code).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stderr.text()).toContain('ask requires a question');
  });

  it('reads a question from stdin when no argument is provided', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    mockFetchOk({ answer: 'pipe answer', sources: [] });

    const code = await runAsk({
      stdout,
      stderr,
      stdin: pipedStdin('piped question\n'),
      env: {},
    });

    expect(code).toBe(0);
    expect(stdout.text()).toContain('pipe answer');
  });

  it('forwards scopes when provided', async () => {
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const fetchSpy = mockFetchOk({ answer: 'scoped', sources: [] });

    await runAsk({
      question: 'q',
      scopes: ['work', 'work.platform'],
      stdout,
      stderr,
      stdin: ttyStdin(),
      env: {},
    });

    expect(getFetchJson(fetchSpy)).toEqual({
      json: { question: 'q', scopes: ['work', 'work.platform'] },
    });
  });
});
