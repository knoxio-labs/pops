import { describe, expect, it } from 'vitest';

import {
  messageText,
  samplingParams,
  supportsEffort,
  supportsSamplingParams,
} from '../model-params.js';

describe('supportsSamplingParams', () => {
  it.each(['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6'])(
    'accepts sampling params on %s',
    (model) => {
      expect(supportsSamplingParams(model)).toBe(true);
    }
  );

  it.each([
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-opus-4-8',
    'claude-opus-5-5',
    'claude-fable-5-1',
    'some-future-model',
    '',
  ])('rejects sampling params on %s', (model) => {
    expect(supportsSamplingParams(model)).toBe(false);
  });

  it('does not match a model id that merely contains a supported one', () => {
    expect(supportsSamplingParams('anthropic.claude-haiku-4-5')).toBe(false);
  });
});

describe('samplingParams', () => {
  it('carries the temperature for a model that accepts it, zero included', () => {
    expect(samplingParams('claude-haiku-4-5-20251001', 0)).toEqual({ temperature: 0 });
    expect(samplingParams('claude-sonnet-4-6', 0.3)).toEqual({ temperature: 0.3 });
  });

  it('is empty for a model that rejects sampling params', () => {
    const params = samplingParams('claude-sonnet-5-5', 0);
    expect(params).toEqual({});
    expect('temperature' in params).toBe(false);
  });
});

describe('supportsEffort', () => {
  it.each(['claude-haiku-4-5', 'claude-haiku-4-5-20251001'])('is false for %s', (model) => {
    expect(supportsEffort(model)).toBe(false);
  });

  it.each(['claude-sonnet-4-6', 'claude-sonnet-5-5', 'claude-opus-5-5', 'some-future-model'])(
    'is true for %s',
    (model) => {
      expect(supportsEffort(model)).toBe(true);
    }
  );
});

describe('messageText', () => {
  it('skips a leading thinking block', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'answer' },
    ];
    expect(messageText(content)).toBe('answer');
  });

  it('joins several text blocks in order, across other block types', () => {
    const content = [
      { type: 'text', text: 'a' },
      { type: 'tool_use', id: 't', name: 'n', input: {} },
      { type: 'text', text: 'b' },
    ];
    expect(messageText(content)).toBe('ab');
  });

  it('is empty when there is no text block', () => {
    const thinkingOnly = [{ type: 'thinking', thinking: 'x', signature: 's' }];
    expect(messageText(thinkingOnly)).toBe('');
    expect(messageText([])).toBe('');
  });

  it('ignores a block typed text that carries no string', () => {
    const content = [{ type: 'text' }, { type: 'text', text: 'kept' }];
    expect(messageText(content)).toBe('kept');
  });
});
