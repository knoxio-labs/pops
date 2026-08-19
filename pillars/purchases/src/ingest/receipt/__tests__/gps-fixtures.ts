/**
 * A coordinate in the shape EXIF stores one, for the reader's tests.
 *
 * Kept apart from the block writer because these are the *values* a fixture
 * states, where `exif-bytes.ts` is the byte layout that carries them.
 */

/** Numerator over denominator, exactly as the file stores it. */
export type Rational = readonly [number, number];

/**
 * A hemisphere letter and three rationals.
 *
 * Degrees, minutes and seconds are given separately rather than as a decimal
 * so a fixture can be malformed the way a real file is — a zero denominator,
 * a degree count past 90 — rather than only by passing a number this builder
 * would have to decompose. The letters are plain strings so a test can state
 * one that is not a hemisphere at all.
 */
export interface GpsFixture {
  /** `N` / `S`, or something that is neither. */
  readonly latitudeRef: string;
  /** `E` / `W`, or something that is neither. */
  readonly longitudeRef: string;
  readonly latitude: readonly [Rational, Rational, Rational];
  readonly longitude: readonly [Rational, Rational, Rational];
}

/** Whole degrees, no minutes or seconds. */
export function degrees(value: number): [Rational, Rational, Rational] {
  return [
    [value, 1],
    [0, 1],
    [0, 1],
  ];
}

/** Sydney's CBD, to the second: 33°52'12" S, 151°12'36" E. */
export const SYDNEY_GPS: GpsFixture = {
  latitudeRef: 'S',
  longitudeRef: 'E',
  latitude: [
    [33, 1],
    [52, 1],
    [1200, 100],
  ],
  longitude: [
    [151, 1],
    [12, 1],
    [3600, 100],
  ],
};
