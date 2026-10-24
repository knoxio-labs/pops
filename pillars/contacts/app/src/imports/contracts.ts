import type { ReviewSnapshot } from '../review/contracts';

/** Explicit file parsing and source identity; national phone numbers have no default country. */
export interface FileImportInput {
  file: File;
  format: 'vcard' | 'google_csv';
  encoding: 'utf8' | 'utf16_le' | 'utf16_be' | 'windows1252';
  sourceName: string;
  collectionKey: string;
  phoneCountryCode?: string;
}

/** Staging persists a preview without changing any person or merging identities. */
export interface FileImportGateway {
  stage: (input: FileImportInput) => Promise<ReviewSnapshot>;
}
