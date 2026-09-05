import { describe, expect, it } from 'vitest';

import {
  deltaWording,
  itemCountLine,
  lineQualifier,
  photoCountLine,
  reviewMessage,
} from './ios-receipt-copy';

import type { GateFailure } from '@/fixtures/receipts';

const failure = (kind: GateFailure['kind']): GateFailure => ({ kind, detail: '' });

describe('review message', () => {
  it('speaks of one problem when two failures are the same kind of problem', () => {
    const message = reviewMessage([failure('unreadableLine'), failure('noLines')]);
    expect(message).toContain('Parts of this receipt could not be read');
    expect(message).not.toContain('more than one problem');
  });

  it('speaks of several once the kinds differ', () => {
    expect(reviewMessage([failure('unreadableLine'), failure('sumMismatch')])).toContain(
      'more than one problem'
    );
  });

  it('has a sentence for a review with no stated failure at all', () => {
    expect(reviewMessage([])).toContain('needs a closer look');
  });

  it('names arithmetic and everything else separately', () => {
    expect(reviewMessage([failure('sumMismatch')])).toContain("don't add up");
    expect(reviewMessage([failure('ambiguousTax')])).toContain("didn't check out");
  });
});

describe('delta wording', () => {
  it('says which side of the printed total the lines fell on', () => {
    expect(deltaWording(-250)).toBe('2.50 short of the total');
    expect(deltaWording(250)).toBe('2.50 over the total');
  });
});

describe('counts', () => {
  it('is absent at zero rather than saying none', () => {
    expect(itemCountLine(0)).toBeUndefined();
    expect(photoCountLine(0)).toBeUndefined();
  });

  it('is singular at one', () => {
    expect(itemCountLine(1)).toBe('1 item');
    expect(photoCountLine(1)).toBe('From 1 photo.');
    expect(itemCountLine(12)).toBe('12 items');
    expect(photoCountLine(2)).toBe('From 2 photos.');
  });
});

describe('line qualifier', () => {
  it('never invents a quantity of one', () => {
    expect(lineQualifier(undefined, undefined)).toBeUndefined();
    expect(lineQualifier(2, undefined)).toBe('×2');
    expect(lineQualifier(undefined, '$4.90/kg')).toBe('$4.90/kg');
    expect(lineQualifier(2, '$4.90/kg')).toBe('×2 $4.90/kg');
  });
});
