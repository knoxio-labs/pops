import { describe, expect, it } from 'vitest';

import { HELP, readCell } from '../huly-partition-plan.mjs';

describe('readCell', () => {
  it('reads a cell object', () => {
    expect(readCell('{"status":"Merged","hasComponent":true}')).toEqual({
      status: 'Merged',
      hasComponent: true,
    });
  });

  it('reads an empty object as the unfiltered cell', () => {
    expect(readCell('{}')).toEqual({});
  });

  // Valid JSON is not enough. `null` would reach `refineCell` as a TypeError
  // and `"x"` would spread into a nonsense filter — both are the caller
  // mistyping an argument, which deserves a message rather than a stack trace.
  it.each(['null', '"x"', '7', 'true', '[]', '[{"status":"Merged"}]'])(
    'refuses %s, which parses but is not a cell',
    (raw) => {
      expect(() => readCell(raw)).toThrow(/a cell must be a JSON object/u);
    }
  );

  it('lets a genuine JSON syntax error through, with the parser talking', () => {
    expect(() => readCell('not json')).toThrow(SyntaxError);
  });
});

describe('HELP', () => {
  // The help text is where a caller learns the recipe stops being provable at
  // the title axis. Losing that line loses the only warning most readers see.
  it('says the title axis is an assumption rather than a proof', () => {
    expect(HELP).toContain('titleRegex');
    expect(HELP).toContain('assumption');
  });

  it('names every mode it accepts', () => {
    for (const mode of ['--roots', '--refine', '--assess', '--self-test']) {
      expect(HELP).toContain(mode);
    }
  });
});
