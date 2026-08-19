/**
 * Which evidence about when and where a shop happened wins.
 *
 * Four things can speak, and they are not equally credible:
 *
 * | rank | evidence                                     | what it is about            |
 * | ---- | -------------------------------------------- | --------------------------- |
 * | 1    | the zone the client declared                 | where the device WAS        |
 * | 2    | the zone the model inferred from the address | where the SHOP is           |
 * | 3    | the offset on the client's `capturedAt`      | where the device was        |
 * | 4    | the offset the camera wrote in EXIF          | where the CAMERA was        |
 * | 5    | the configured default                       | where the shops usually are |
 *
 * The ordering that looks wrong and is not: a client's *declared zone*
 * outranks the printed address, while the *offset* implied by the same
 * client's `capturedAt` does not. A device naming `Australia/Perth` is
 * making a statement, and carries a DST rule with it; an offset of `+08:00`
 * is a fact about one instant, the same species of evidence the camera
 * writes. Both offsets describe where the photograph was taken rather than
 * where the shop is — a receipt photographed at home a week later carries
 * home's offset and that week's date — which is exactly why the printed
 * address sits between them.
 *
 * **Absent is the ordinary case.** Phones strip EXIF on share, screenshots
 * never had any, a PDF invoice is not a photograph, and a browser drop-zone
 * sends no capture block at all. Every tier falls through, and an upload
 * carrying none of this behaves exactly as it did before any of it existed.
 *
 * The receipt's own printed date still wins for `orderedAt` whenever the
 * paper states one — a photo taken at the till and a photo taken at home
 * must produce the same purchase date, and only the paper knows it. What
 * capture time replaces is the *upload* time in the undated fallback, and
 * the purchase keeps its `date-uncertain` tag either way.
 *
 * Location is carried and never inspected. Nothing here resolves a zone
 * from coordinates: that needs a geographic database this fleet does not
 * have, and inventing one from a bounding box would be a guess wearing a
 * measurement's clothes.
 */
import {
  instantFromLocalParts,
  instantFromLocalPartsAtOffset,
  isKnownTimeZone,
  isPlausibleUtcOffsetMinutes,
  parseUtcOffsetMinutes,
  storeTimeZone,
} from '../local-time.js';
import { readPhotoCapture } from './exif.js';

import type { CaptureSource } from '../../contract/constants.js';
import type { CaptureLocalTime, CaptureLocation, PhotoCapture } from './exif.js';
import type { ReceiptPart } from './vision.js';

export type { CaptureLocation } from './exif.js';

/** The contract's capture block, as the handler received it. */
export interface ClientCapture {
  readonly capturedAt?: string | undefined;
  readonly timeZone?: string | undefined;
  readonly location?: CaptureLocation | undefined;
}

/**
 * What to resolve a printed wall clock against.
 *
 * A zone and an offset are not interchangeable. A zone carries the DST rule
 * needed to place a date months away from the evidence; an offset is only
 * ever a statement about one instant. Keeping them apart is what stops an
 * `Etc/GMT+8`-shaped fabrication being invented for the half-hour zones
 * that have no such name.
 */
export type TimeReference =
  | { readonly kind: 'zone'; readonly zone: string }
  | { readonly kind: 'offset'; readonly offsetMinutes: number };

export interface ResolvedCapture {
  readonly timeReference: TimeReference;
  /**
   * False when the zone attached to this purchase was established neither
   * by the receipt nor by the client — the configured default, and an
   * offset borrowed from a photograph. An offset is better evidence than
   * the default and is still not a statement about where the shop is, so
   * both carry the tag.
   */
  readonly zoneCertain: boolean;
  /** When the shutter fired, when anything says so. */
  readonly capturedAt: string | null;
  readonly capturedAtSource: CaptureSource | null;
  /** Sensitive. Stored, never logged, never in a URL, never in an error. */
  readonly location: CaptureLocation | null;
  readonly locationSource: CaptureSource | null;
  /**
   * Minutes ahead of UTC at capture, from whichever claimant stated one and
   * within the range a zone could have been on — the range the stored
   * column CHECKs. A claimant outside it stated no offset.
   */
  readonly utcOffsetMinutes: number | null;
  /** The IANA zone the client declared, when it declared a usable one. */
  readonly declaredTimeZone: string | null;
}

/**
 * The first part that says anything about itself.
 *
 * Several photographs of one long receipt are one capture event seconds
 * apart, so any of them answers the question and the first is the frame the
 * sender took first. A mixed submission — a stripped photograph beside one
 * that kept its metadata — is why this looks past the parts that carry
 * none rather than stopping at part one.
 */
export function firstPhotoCapture(parts: readonly ReceiptPart[]): PhotoCapture | null {
  for (const part of parts) {
    const capture = readPhotoCapture(Buffer.from(part.dataBase64, 'base64'), part.mediaType);
    if (capture !== null) return capture;
  }
  return null;
}

const OFFSET_SUFFIX_RE = /[+-]\d{2}:\d{2}$/u;

/** RFC 3339's spelling of "this instant is right and I cannot say where". */
const OFFSET_UNKNOWN = '-00:00';

/**
 * The offset the client actually wrote, or null.
 *
 * `Z` is deliberately not read as "the device was on UTC". It is what a
 * client sends after calling `toISOString()`, so treating it as evidence of
 * place would put every normalised upload in Greenwich — and a device that
 * really was on UTC loses nothing, because the instant is correct either
 * way and the zone falls through to better evidence. `-00:00` says the same
 * thing in the form of an offset, which is why it is read as none: RFC 3339
 * gives it exactly the meaning `+00:00` does not.
 *
 * The bound is `local-time.ts`'s, and the contract's is wider — `+20:00` is
 * a well-formed instant that no zone has ever been on. That token places
 * the moment and says nothing about where the device stood.
 */
function declaredOffsetMinutes(capturedAt: string | undefined): number | null {
  if (capturedAt === undefined) return null;
  const match = OFFSET_SUFFIX_RE.exec(capturedAt);
  if (match === null || match[0] === OFFSET_UNKNOWN) return null;
  return parseUtcOffsetMinutes(match[0]);
}

/**
 * The device clock as one canonical instant.
 *
 * Normalised rather than kept verbatim, so two clients that spell the same
 * moment differently are comparable and a value that is not a moment at all
 * cannot reach the database.
 */
function clientInstant(capturedAt: string | undefined): string | null {
  if (capturedAt === undefined) return null;
  const parsed = new Date(capturedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * When the camera says the shutter fired.
 *
 * The file states a wall clock, and states the offset beside it only
 * sometimes. Without one, the clock is read against whatever zone the
 * receipt itself established — a guess about the camera, and the same guess
 * already being made about the shop.
 */
function exifInstant(
  localTime: CaptureLocalTime,
  cameraOffset: number | null,
  reference: TimeReference
): string | null {
  if (cameraOffset !== null) {
    return instantFromLocalPartsAtOffset(localTime, cameraOffset);
  }
  return reference.kind === 'offset'
    ? instantFromLocalPartsAtOffset(localTime, reference.offsetMinutes)
    : instantFromLocalParts(localTime, reference.zone);
}

function resolveTimeReference(
  declaredZone: string | null,
  modelTimeZone: string | null,
  clientOffset: number | null,
  exifOffset: number | null
): TimeReference {
  if (declaredZone !== null) return { kind: 'zone', zone: declaredZone };
  if (isKnownTimeZone(modelTimeZone)) return { kind: 'zone', zone: modelTimeZone };
  if (clientOffset !== null) return { kind: 'offset', offsetMinutes: clientOffset };
  if (exifOffset !== null) return { kind: 'offset', offsetMinutes: exifOffset };
  return { kind: 'zone', zone: storeTimeZone() };
}

/** A fact, and which claimant stated it. */
interface Claimed<T> {
  readonly value: T | null;
  readonly source: CaptureSource | null;
}

function claim<T>(fromClient: T | null, fromPhoto: T | null): Claimed<T> {
  if (fromClient !== null) return { value: fromClient, source: 'client' };
  if (fromPhoto !== null) return { value: fromPhoto, source: 'exif' };
  return { value: null, source: null };
}

/** Everything the body claimed, in the shapes the ranking compares. */
interface ClientSignals {
  readonly declaredZone: string | null;
  readonly offsetMinutes: number | null;
  readonly instant: string | null;
  readonly location: CaptureLocation | null;
}

function clientSignals(client: ClientCapture | undefined): ClientSignals {
  return {
    declaredZone: isKnownTimeZone(client?.timeZone) ? client.timeZone : null,
    offsetMinutes: declaredOffsetMinutes(client?.capturedAt),
    instant: clientInstant(client?.capturedAt),
    location: client?.location ?? null,
  };
}

/** Rank the evidence once, before anything is mapped. */
export function resolveCapture(
  client: ClientCapture | undefined,
  photo: PhotoCapture | null,
  modelTimeZone: string | null
): ResolvedCapture {
  const said = clientSignals(client);
  const exifOffset = storableOffset(photo?.utcOffsetMinutes ?? null);
  const timeReference = resolveTimeReference(
    said.declaredZone,
    modelTimeZone,
    said.offsetMinutes,
    exifOffset
  );

  const instant = claim(said.instant, photoInstant(photo, exifOffset, timeReference));
  const place = claim(said.location, photo?.location ?? null);

  return {
    timeReference,
    zoneCertain: said.declaredZone !== null || isKnownTimeZone(modelTimeZone),
    capturedAt: instant.value,
    capturedAtSource: instant.source,
    location: place.value,
    locationSource: place.source,
    utcOffsetMinutes: said.offsetMinutes ?? exifOffset,
    declaredTimeZone: said.declaredZone,
  };
}

function photoInstant(
  photo: PhotoCapture | null,
  cameraOffset: number | null,
  reference: TimeReference
): string | null {
  if (photo === null || photo.localTime === null) return null;
  return exifInstant(photo.localTime, cameraOffset, reference);
}

/**
 * An offset only if it is one a zone could have been on.
 *
 * The reader already refuses a wider figure, and this holds the same line
 * for a `PhotoCapture` built by anything else: the number leaves here for a
 * column that CHECKs the range, and a row refused there takes the whole
 * ingest transaction — purchase, items, charges and documents — with it.
 */
function storableOffset(minutes: number | null): number | null {
  return minutes !== null && isPlausibleUtcOffsetMinutes(minutes) ? minutes : null;
}
