import { z } from 'zod';

const markerSchema = z.strictObject({
  version: z.literal(1),
  account: z
    .string()
    .min(1)
    .refine((account) => account.trim().length > 0),
  epoch: z.uuid(),
});

/** Validated browser metadata identity, independent of credentials and document bytes. */
export type UploadHostMarker = z.infer<typeof markerSchema>;

/** Shared public-safe failure text for unavailable upload metadata authority. */
export const uploadHostUnavailable =
  'Upload recovery is unavailable. Verify your signed-in account and browser storage, then try again.';

/** Normalize the captured server authority, rejecting paths and embedded credentials. */
export function uploadHostServerOrigin(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Upload recovery requires an HTTP server origin without a path or credentials.'
    );
  return url.origin;
}

/** Internal storage adapter that pins the browser storage object and verifies mutations. */
export class DocumentUploadHostStorage {
  readonly markerKey: string;
  private captured: Storage | null = null;

  constructor(
    private readonly server: string,
    private readonly getStorage: () => Storage
  ) {
    this.markerKey = `pops:document-uploads:identity:${JSON.stringify(server)}`;
  }

  storage(): Storage {
    const value = this.getStorage();
    if (this.captured !== null && this.captured !== value) throw new Error(uploadHostUnavailable);
    this.captured = value;
    return value;
  }

  readMarker(): UploadHostMarker | null {
    const value = this.storage().getItem(this.markerKey);
    if (value === null) return null;
    const payload: unknown = JSON.parse(value);
    return markerSchema.parse(payload);
  }

  accountPrefix(account: string): string {
    return `pops:document-uploads:data:${JSON.stringify([this.server, account])}:`;
  }

  purge(account: string): void {
    const target = this.storage();
    const keys: string[] = [];
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index);
      if (key?.startsWith(this.accountPrefix(account))) keys.push(key);
    }
    for (const key of keys) {
      target.removeItem(key);
      if (target.getItem(key) !== null) throw new Error(uploadHostUnavailable);
    }
  }

  removeMarker(): void {
    this.storage().removeItem(this.markerKey);
    if (this.storage().getItem(this.markerKey) !== null) throw new Error(uploadHostUnavailable);
  }

  writeMarker(marker: UploadHostMarker): void {
    const serialized = JSON.stringify(marker);
    this.storage().setItem(this.markerKey, serialized);
    if (this.storage().getItem(this.markerKey) !== serialized)
      throw new Error(uploadHostUnavailable);
  }
}
