import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  filterKnownParts,
  MobileEgoMessagePartSchema,
  MobileEgoStreamBodySchema,
  MobileEgoStreamFrameSchema,
  MobileEgoWirePartSchema,
} from '../mobile-ego-schemas.js';

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../contracts/ego-wire-v1.json'
);
const FIXTURE_SHA256 = 'c3aac1d485555c36d8d447a72e1788cea321c2589c4c17ffe85852aa2f0bc14f';

const FixtureSchema = z.object({
  parts: z.object({
    valid: z.array(z.unknown()).min(1),
    invalid: z.array(z.unknown()).min(1),
  }),
  frames: z.object({
    valid: z.array(z.unknown()).min(1),
    invalid: z.array(z.unknown()).min(1),
    unknown: z.array(z.unknown()).min(1),
  }),
  chatBodies: z.object({
    valid: z.array(z.unknown()).min(1),
    invalid: z.array(z.unknown()).min(1),
  }),
});

const fixtureBytes = readFileSync(FIXTURE_PATH);
const fixture = FixtureSchema.parse(JSON.parse(fixtureBytes.toString('utf8')));

describe('ego wire fixture', () => {
  it('is byte-for-byte the file the Swift decoder pins', () => {
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(FIXTURE_SHA256);
  });

  it('covers every part and frame type', () => {
    expect(fixture.parts.valid.map((p) => MobileEgoMessagePartSchema.parse(p).type)).toEqual(
      expect.arrayContaining(['text', 'entity', 'actions'])
    );
    expect(
      fixture.frames.valid.map((f) => MobileEgoStreamFrameSchema.parse(f).type).toSorted()
    ).toEqual(['done', 'error', 'navigate', 'part', 'token', 'tool']);
  });
});

describe('MobileEgoMessagePartSchema', () => {
  it.each(fixture.parts.valid.map((p, i) => [i, p] as const))(
    'accepts valid part %i',
    (_i, part) => {
      expect(MobileEgoMessagePartSchema.safeParse(part).success).toBe(true);
      expect(MobileEgoWirePartSchema.safeParse(part).success).toBe(true);
    }
  );

  it.each(fixture.parts.invalid.map((p, i) => [i, p] as const))(
    'rejects invalid part %i',
    (_i, part) => {
      expect(MobileEgoMessagePartSchema.safeParse(part).success).toBe(false);
    }
  );

  it('rejects a null subtitle without the filter', () => {
    expect(
      MobileEgoMessagePartSchema.safeParse({
        type: 'entity',
        uri: 'pops:a/b/c',
        title: 't',
        subtitle: null,
      }).success
    ).toBe(false);
  });
});

describe('MobileEgoStreamFrameSchema', () => {
  it.each(fixture.frames.valid.map((f, i) => [i, f] as const))(
    'accepts valid frame %i',
    (_i, f) => {
      expect(MobileEgoStreamFrameSchema.safeParse(f).success).toBe(true);
    }
  );

  it.each(fixture.frames.invalid.map((f, i) => [i, f] as const))(
    'rejects invalid frame %i',
    (_i, f) => {
      expect(MobileEgoStreamFrameSchema.safeParse(f).success).toBe(false);
    }
  );

  it.each(fixture.frames.unknown.map((f, i) => [i, f] as const))(
    'rejects unknown frame %i',
    (_i, f) => {
      expect(MobileEgoStreamFrameSchema.safeParse(f).success).toBe(false);
    }
  );
});

describe('MobileEgoStreamBodySchema', () => {
  it.each(fixture.chatBodies.valid.map((b, i) => [i, b] as const))(
    'accepts valid body %i',
    (_i, b) => {
      expect(MobileEgoStreamBodySchema.safeParse(b).success).toBe(true);
    }
  );

  it.each(fixture.chatBodies.invalid.map((b, i) => [i, b] as const))(
    'rejects invalid body %i',
    (_i, b) => {
      expect(MobileEgoStreamBodySchema.safeParse(b).success).toBe(false);
    }
  );

  it('accepts a message of exactly 4000 characters', () => {
    expect(MobileEgoStreamBodySchema.safeParse({ message: 'x'.repeat(4000) }).success).toBe(true);
  });
});

describe('filterKnownParts', () => {
  it('keeps exactly the valid parts, in order', () => {
    expect(filterKnownParts([...fixture.parts.valid, ...fixture.parts.invalid])).toEqual(
      fixture.parts.valid
    );
  });

  it('turns a null subtitle into an absent one', () => {
    const [part] = filterKnownParts([
      { type: 'entity', uri: 'pops:a/b/c', title: 't', subtitle: null },
    ]);
    expect(part).toEqual({ type: 'entity', uri: 'pops:a/b/c', title: 't' });
    expect(part && 'subtitle' in part).toBe(false);
  });

  it('drops non-object entries', () => {
    expect(filterKnownParts([null, 'x', 3, undefined])).toEqual([]);
  });
});
