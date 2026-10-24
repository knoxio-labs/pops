import { describe, expect, it } from 'vitest';

import { buildCodePrompt, parseCodeReply } from '../prompt.js';

import type { CodesSuggestRequest } from '../../../../contract/rest-codes.js';

const base: CodesSuggestRequest = {
  item: { name: 'The Book Thief' },
  existing: [],
  count: 3,
};

function reply(codes: string[]): string {
  return JSON.stringify({ suggestions: codes.map((code) => ({ code, reason: `r ${code}` })) });
}

describe('buildCodePrompt', () => {
  it('says there are no codes yet and no destination when both are absent', () => {
    const prompt = buildCodePrompt(base);

    expect(prompt).toContain('(none yet)');
    expect(prompt).toContain('Destination: not chosen yet');
    expect(prompt).toContain('Type: unknown');
  });

  it('lists every existing code with its item, type and place', () => {
    const prompt = buildCodePrompt({
      ...base,
      existing: [
        { code: 'BK-NOVEL-1', name: 'Fortaleza Digital', typeKey: 'book', place: 'Office' },
        { code: 'R001', name: 'Rehearsal box 1' },
      ],
    });

    expect(prompt).toContain('Existing codes (2)');
    expect(prompt).toContain('BK-NOVEL-1 | Fortaleza Digital | book | Office');
    expect(prompt).toContain('R001 | Rehearsal box 1 | - | -');
  });

  it('describes the type, container flag, destination path and container', () => {
    const prompt = buildCodePrompt({
      ...base,
      item: { name: 'Box', typeKey: 'storage_box', typeLabel: 'Storage box', isContainer: true },
      destination: { path: ['Home', 'Office'], container: { name: 'Shelves', code: 'SHELVES-1' } },
    });

    expect(prompt).toContain('Type: Storage box (storage_box)');
    expect(prompt).toContain('It is a container');
    expect(prompt).toContain('Destination: Home > Office');
    expect(prompt).toContain('Inside container: Shelves (code SHELVES-1)');
  });

  it('states a required prefix only when a stem is given', () => {
    expect(buildCodePrompt(base)).not.toContain('must start with');
    expect(buildCodePrompt({ ...base, stem: 'BK-' })).toContain('must start with "BK-"');
  });
});

describe('parseCodeReply', () => {
  it('returns null for text that is not JSON', () => {
    expect(parseCodeReply('BK-NOVEL-3', base)).toBeNull();
  });

  it('returns null for JSON of the wrong shape', () => {
    expect(parseCodeReply(JSON.stringify({ codes: ['BK-1'] }), base)).toBeNull();
  });

  it('keeps free codes in order and trims them', () => {
    const parsed = parseCodeReply(reply([' BK-NOVEL-3 ', 'BOOK-1']), base);

    expect(parsed).toEqual([
      { code: 'BK-NOVEL-3', reason: 'r  BK-NOVEL-3' },
      { code: 'BOOK-1', reason: 'r BOOK-1' },
    ]);
  });

  it('keeps any code of 1 to 64 characters and drops blank or longer ones', () => {
    const parsed = parseCodeReply(
      reply(['BK NOVEL', 'BK_1', '-BK-1', '   ', 'A'.repeat(65), 'A'.repeat(64)]),
      { ...base, count: 10 }
    );

    expect(parsed?.map((entry) => entry.code)).toEqual([
      'BK NOVEL',
      'BK_1',
      '-BK-1',
      'A'.repeat(64),
    ]);
  });

  it('drops codes already in use and repeats, case-insensitively', () => {
    const parsed = parseCodeReply(reply(['bk-novel-1', 'BK-NOVEL-3', 'bk-novel-3']), {
      ...base,
      existing: [{ code: 'BK-NOVEL-1', name: 'Fortaleza Digital' }],
    });

    expect(parsed?.map((entry) => entry.code)).toEqual(['BK-NOVEL-3']);
  });

  it('drops codes that do not start with the stem', () => {
    const parsed = parseCodeReply(reply(['BOX-1', 'bk-2']), { ...base, stem: 'BK-' });

    expect(parsed?.map((entry) => entry.code)).toEqual(['bk-2']);
  });

  it('stops at the requested count', () => {
    const parsed = parseCodeReply(reply(['A-1', 'A-2', 'A-3']), { ...base, count: 2 });

    expect(parsed?.map((entry) => entry.code)).toEqual(['A-1', 'A-2']);
  });

  it('caps a reason at 200 characters', () => {
    const text = JSON.stringify({ suggestions: [{ code: 'A-1', reason: 'x'.repeat(300) }] });

    expect(parseCodeReply(text, base)?.[0]?.reason).toHaveLength(200);
  });
});
