import { describe, expect, it } from 'vitest';

import { eventLink } from './model';

describe('event link navigation', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///secret',
    '/relative',
    'not a url',
    '',
  ])('does not navigate unsupported URL %s', (value) => {
    expect(eventLink(value)).toBeUndefined();
  });
  it('formats explicit web URLs without changing their source type', () => {
    expect(eventLink('HTTPS://festival.example')).toBe('https://festival.example/');
    expect(eventLink('http://festival.example/tickets')).toBe('http://festival.example/tickets');
    expect(eventLink()).toBeUndefined();
  });
});
