/**
 * In-memory fake of the purchases receipt store for finance integration tests.
 *
 * Implements {@link PurchasesReceiptsClient} over a map keyed by content hash,
 * as the real store is, and keeps the pins each owner holds. `setUnavailable`
 * makes every call throw the outage error; `failRelease` breaks only the
 * release leg, which is the one finance treats as best effort. `willRead`
 * decides what the next `extract` makes of the files it is handed.
 */
import { createHash } from 'node:crypto';

import {
  type PurchasesReceiptsClient,
  type ReceiptExtraction,
  PurchasesUnavailableError,
  ReceiptNotAPictureError,
  ReceiptNotFoundError,
  ReceiptRejectedError,
} from '../purchases/client.js';

import type {
  ReceiptPart,
  ReceiptReading,
  StoredReceiptBytes,
} from '../../contract/rest-transaction-attachments-schemas.js';

const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const HASH_LENGTH = 64;

/**
 * What `extract` makes of a receipt. `no-reader` is purchases with no vision
 * model: it refuses before storing anything, while the rest of the store works.
 */
export type FakeReading =
  | { kind: 'draft'; draft: Extract<ReceiptReading, { kind: 'draft' }>['draft'] }
  | { kind: 'unreadable' }
  | { kind: 'already-a-purchase' }
  | { kind: 'no-reader' };

export interface PurchasesCall {
  operation: 'store' | 'extract' | 'addReferences' | 'removeReferences' | 'read' | 'thumbnail';
  ownerUri?: string;
  receiptUris?: string[];
}

export interface PurchasesFake extends PurchasesReceiptsClient {
  /** Every call that reached the store, in order. */
  readonly calls: PurchasesCall[];
  /** The URIs an owner holds a pin on, sorted. */
  pinsOf(ownerUri: string): string[];
  /** Put a file in the store without going through finance. Returns its URI. */
  seed(part: ReceiptPart): string;
  setUnavailable(value: boolean): void;
  /** Decide what `extract` answers from now on. Unreadable until told otherwise. */
  willRead(reading: FakeReading): void;
  /** Break `removeReferences` only. */
  failRelease(value: boolean): void;
  /** Runs at the start of every call, before the store acts on it. */
  onCall(listener: (call: PurchasesCall) => void): void;
}

export function receiptUriOf(part: ReceiptPart): string {
  const hash = createHash('sha256').update(Buffer.from(part.dataBase64, 'base64')).digest('hex');
  return `pops://purchases/receipt/${hash}`;
}

function hashOf(receiptUri: string): string {
  return receiptUri.slice(-HASH_LENGTH);
}

function bytesOf(sha256: string, part: ReceiptPart): StoredReceiptBytes {
  return {
    sha256,
    mediaType: part.mediaType,
    byteLength: Buffer.from(part.dataBase64, 'base64').length,
    dataBase64: part.dataBase64,
  };
}

class FakeReceiptStore implements PurchasesFake {
  readonly calls: PurchasesCall[] = [];
  private readonly files = new Map<string, ReceiptPart>();
  private readonly pins = new Map<string, Set<string>>();
  private readonly listeners: ((call: PurchasesCall) => void)[] = [];
  private unavailable = false;
  private reading: FakeReading = { kind: 'unreadable' };
  private releaseFails = false;

  pinsOf(ownerUri: string): string[] {
    return [...(this.pins.get(ownerUri) ?? [])].toSorted();
  }

  seed(part: ReceiptPart): string {
    const uri = receiptUriOf(part);
    this.files.set(hashOf(uri), part);
    return uri;
  }

  setUnavailable(value: boolean): void {
    this.unavailable = value;
  }

  willRead(reading: FakeReading): void {
    this.reading = reading;
  }

  failRelease(value: boolean): void {
    this.releaseFails = value;
  }

  onCall(listener: (call: PurchasesCall) => void): void {
    this.listeners.push(listener);
  }

  store(parts: ReceiptPart[]): Promise<string[]> {
    this.enter({ operation: 'store' });
    return Promise.resolve(this.keep(parts, 'receipt.store'));
  }

  extract(parts: ReceiptPart[]): Promise<ReceiptExtraction> {
    this.enter({ operation: 'extract' });
    const reading = this.reading;
    if (reading.kind === 'no-reader') {
      throw new PurchasesUnavailableError('unavailable', 'receipt.extract');
    }
    const receiptUris = this.keep(parts, 'receipt.extract');
    if (reading.kind === 'already-a-purchase') return Promise.resolve({ kind: reading.kind });
    return Promise.resolve({ ...reading, receiptUris });
  }

  addReferences(ownerUri: string, receiptUris: string[]): Promise<void> {
    this.enter({ operation: 'addReferences', ownerUri, receiptUris });
    for (const uri of receiptUris) this.stored(hashOf(uri), 'receipt.addReferences');
    const held = this.pins.get(ownerUri) ?? new Set<string>();
    for (const uri of receiptUris) held.add(uri);
    this.pins.set(ownerUri, held);
    return Promise.resolve();
  }

  removeReferences(ownerUri: string, receiptUris?: string[]): Promise<void> {
    this.enter({ operation: 'removeReferences', ownerUri, receiptUris });
    if (this.releaseFails) {
      throw new PurchasesUnavailableError('unavailable', 'receipt.removeReferences');
    }
    if (receiptUris === undefined) this.pins.delete(ownerUri);
    else for (const uri of receiptUris) this.pins.get(ownerUri)?.delete(uri);
    return Promise.resolve();
  }

  read(sha256: string): Promise<StoredReceiptBytes> {
    this.enter({ operation: 'read' });
    return Promise.resolve(bytesOf(sha256, this.stored(sha256, 'receipt.read')));
  }

  thumbnail(sha256: string): Promise<StoredReceiptBytes> {
    this.enter({ operation: 'thumbnail' });
    const part = this.stored(sha256, 'receipt.thumbnail');
    if (!part.mediaType.startsWith('image/')) {
      throw new ReceiptNotAPictureError('This receipt is not an image');
    }
    return Promise.resolve(bytesOf(sha256, { ...part, mediaType: 'image/jpeg' }));
  }

  private keep(parts: ReceiptPart[], operation: string): string[] {
    const refused = parts.find((part) => !ACCEPTED_MEDIA_TYPES.includes(part.mediaType));
    if (refused !== undefined) {
      throw new ReceiptRejectedError(`unsupported media type ${refused.mediaType}`, operation);
    }
    return parts.map((part) => this.seed(part));
  }

  private enter(call: PurchasesCall): void {
    for (const listener of this.listeners) listener(call);
    if (this.unavailable) {
      throw new PurchasesUnavailableError('unavailable', `receipt.${call.operation}`);
    }
    this.calls.push(call);
  }

  private stored(sha256: string, operation: string): ReceiptPart {
    const part = this.files.get(sha256);
    if (part === undefined) throw new ReceiptNotFoundError(operation);
    return part;
  }
}

export function makePurchasesFake(): PurchasesFake {
  return new FakeReceiptStore();
}
