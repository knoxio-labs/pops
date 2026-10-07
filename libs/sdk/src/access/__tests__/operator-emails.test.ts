import { describe, expect, it } from 'vitest';

import { normalizeEmail, readOperatorEmails } from '../operator-emails.js';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Owner@Pops.Test \n')).toBe('owner@pops.test');
  });

  it('folds nothing else, so a plus tag or a dot stays a different address', () => {
    expect(normalizeEmail('o.wner+tag@pops.test')).toBe('o.wner+tag@pops.test');
  });
});

describe('readOperatorEmails', () => {
  it('reads a comma-separated list, normalising each entry', () => {
    const emails = readOperatorEmails({
      POPS_OPERATOR_EMAILS: 'Owner@Pops.Test, second@pops.test ,THIRD@POPS.TEST',
    });

    expect([...emails].toSorted()).toEqual([
      'owner@pops.test',
      'second@pops.test',
      'third@pops.test',
    ]);
  });

  it('drops empty entries left by stray commas', () => {
    expect([...readOperatorEmails({ POPS_OPERATOR_EMAILS: ',owner@pops.test,, ,' })]).toEqual([
      'owner@pops.test',
    ]);
  });

  it('collapses entries that differ only by case', () => {
    expect(readOperatorEmails({ POPS_OPERATOR_EMAILS: 'a@pops.test,A@POPS.TEST' }).size).toBe(1);
  });

  it.each([
    ['unset', {}],
    ['empty', { POPS_OPERATOR_EMAILS: '' }],
    ['only separators', { POPS_OPERATOR_EMAILS: ' , ,' }],
  ])('is empty when the variable is %s', (_label, env) => {
    expect(readOperatorEmails(env).size).toBe(0);
  });

  it('does not split on anything but a comma', () => {
    expect([...readOperatorEmails({ POPS_OPERATOR_EMAILS: 'a@pops.test;b@pops.test' })]).toEqual([
      'a@pops.test;b@pops.test',
    ]);
  });
});
