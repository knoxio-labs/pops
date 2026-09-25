import { describe, expect, it } from 'vitest';

import { codeBlocksSave, codeEntry, codeReducer, holderOf, nextFreeCode } from './code-assist';

import type { CodeAction, CodeEntry, TakenCodes } from './code-assist';

const printer = { id: 'itm-printer', name: 'Label printer' };
const taken: TakenCodes = new Map([
  ['p01', printer],
  ['p02', { id: 'itm-x', name: 'Scanner' }],
  ['b412', { id: 'box-9', name: 'Kitchen 09' }],
  ['tv2', { id: 'itm-tv2', name: 'Bedroom TV' }],
]);

function run(entry: CodeEntry, ...actions: CodeAction[]): CodeEntry {
  return actions.reduce(codeReducer, entry);
}

describe('nextFreeCode', () => {
  it('keeps the stem and the width of the number', () => {
    expect(nextFreeCode('B412', taken)).toBe('B413');
    expect(nextFreeCode('P01', taken)).toBe('P03');
    expect(nextFreeCode('E009', taken)).toBe('E010');
  });

  it('numbers a code that has no number, skipping taken ones', () => {
    expect(nextFreeCode('TV', taken)).toBe('TV3');
    expect(nextFreeCode('Q', taken)).toBe('Q2');
  });
});

describe('holderOf', () => {
  it('matches case-insensitively and ignores surrounding space', () => {
    expect(holderOf(' p01 ', taken, null)).toEqual(printer);
  });

  it('never treats the item keeping its own code as a collision', () => {
    expect(holderOf('P01', taken, 'p01')).toBeNull();
  });

  it('answers null for an empty value', () => {
    expect(holderOf('  ', taken, null)).toBeNull();
  });
});

describe('codeReducer', () => {
  it('offers a suggestion and fills it in on accept', () => {
    const entry = run(codeEntry(), { type: 'suggest' }, { type: 'suggested', suggestion: 'E14' });
    expect(entry.assist).toEqual({ kind: 'offered', suggestion: 'E14' });
    expect(entry.value).toBe('');
    const accepted = codeReducer(entry, { type: 'accept' });
    expect(accepted.value).toBe('E14');
    expect(accepted.check).toEqual({ kind: 'free' });
    expect(accepted.assist).toEqual({ kind: 'idle' });
  });

  it('ignores accept when nothing is offered', () => {
    const entry = run(codeEntry(), { type: 'typed', value: 'A1' });
    expect(codeReducer(entry, { type: 'accept' })).toBe(entry);
  });

  it('drops an offer once the person types their own code', () => {
    const entry = run(
      codeEntry(),
      { type: 'suggested', suggestion: 'E14' },
      { type: 'typed', value: 'E2' }
    );
    expect(entry.assist).toEqual({ kind: 'idle' });
    expect(entry.value).toBe('E2');
  });

  it('reports a taken code with its holder and the next free code', () => {
    const entry = run(
      codeEntry(),
      { type: 'typed', value: 'p01' },
      { type: 'check-started' },
      { type: 'checked', taken }
    );
    expect(entry.check).toEqual({ kind: 'taken', holder: printer, freeCode: 'p03' });
  });

  it('does not check an empty value', () => {
    const entry = run(codeEntry(), { type: 'check-started' }, { type: 'checked', taken });
    expect(entry.check).toEqual({ kind: 'none' });
  });

  it('remembers why no suggestion can be made', () => {
    expect(run(codeEntry(), { type: 'suggest-failed', reason: 'offline' }).assist.kind).toBe(
      'offline'
    );
  });
});

describe('codeBlocksSave', () => {
  it('blocks on a taken code, naming the holder', () => {
    const entry = run(codeEntry(), { type: 'typed', value: 'P01' }, { type: 'checked', taken });
    expect(codeBlocksSave(entry)).toBe('P01 is already on Label printer.');
  });

  it('blocks while the check is running', () => {
    const entry = run(codeEntry(), { type: 'typed', value: 'Z9' }, { type: 'check-started' });
    expect(codeBlocksSave(entry)).toBe('Still checking the code.');
  });

  it('lets an empty code, a free code and the item’s own code through', () => {
    expect(codeBlocksSave(codeEntry())).toBeNull();
    const free = run(codeEntry(), { type: 'typed', value: 'Z9' }, { type: 'checked', taken });
    expect(codeBlocksSave(free)).toBeNull();
    const own = run(codeEntry('P01'), { type: 'checked', taken });
    expect(codeBlocksSave(own)).toBeNull();
  });
});
