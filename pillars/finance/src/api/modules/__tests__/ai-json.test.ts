/**
 * Unit tests for the shared prose-tolerant JSON extraction helper (#3624) —
 * every Claude-response parser in the corrections + categorizer clusters
 * routes through this so a stray sentence around the JSON payload degrades
 * gracefully instead of throwing "Unexpected non-whitespace character after
 * JSON".
 */
import { describe, expect, it } from 'vitest';

import { extractFirstJsonValue, extractJsonFromReply, stripCodeFences } from '../ai-json.js';

describe('stripCodeFences', () => {
  it('strips a ```json fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```').trim()).toBe('{"a":1}');
  });

  it('leaves unfenced text untouched (aside from trim)', () => {
    expect(stripCodeFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('extractFirstJsonValue', () => {
  it('extracts a clean object', () => {
    expect(extractFirstJsonValue('{"a":1}')).toBe('{"a":1}');
  });

  it('extracts a clean array', () => {
    expect(extractFirstJsonValue('[1,2,3]')).toBe('[1,2,3]');
  });

  it('tolerates prose appended after the JSON object', () => {
    const text = '{"a":1}\n\nThis is my best guess for this transaction.';
    expect(extractFirstJsonValue(text)).toBe('{"a":1}');
  });

  it('tolerates prose prepended before the JSON object', () => {
    const text = 'Here you go:\n{"a":1}';
    expect(extractFirstJsonValue(text)).toBe('{"a":1}');
  });

  it('respects braces/brackets embedded inside string values', () => {
    const text = '{"pattern":"{FOO}","note":"array-like [1,2]"}';
    expect(extractFirstJsonValue(text)).toBe(text);
  });

  it('returns null when no JSON value is present', () => {
    expect(extractFirstJsonValue('no json here')).toBeNull();
  });

  it('returns null on an unbalanced/truncated object', () => {
    expect(extractFirstJsonValue('{"a":1')).toBeNull();
  });
});

describe('extractJsonFromReply', () => {
  it('strips fences then extracts the balanced value', () => {
    const reply = '```json\n{"entityName":"Aldi","tags":["Groceries"]}\n```\nLooks correct.';
    expect(extractJsonFromReply(reply)).toBe('{"entityName":"Aldi","tags":["Groceries"]}');
  });
});
