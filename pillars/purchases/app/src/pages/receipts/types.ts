import type { ReceiptUploadData, ReceiptUploadResponses } from '../../purchases-api/types.gen.js';

export type ReceiptOutcome = ReceiptUploadResponses['200'];

export type CreatedOutcome = Extract<ReceiptOutcome, { kind: 'created' }>;
export type NeedsReviewOutcome = Extract<ReceiptOutcome, { kind: 'needs-review' }>;
export type UnreadableOutcome = Extract<ReceiptOutcome, { kind: 'unreadable' }>;

export type PurchaseDetail = CreatedOutcome['purchase'];
export type GateFailure = NeedsReviewOutcome['failures'][number];
export type GateFailureKind = GateFailure['kind'];
export type ExtractedReceipt = NeedsReviewOutcome['extracted'];
export type ExtractedLine = ExtractedReceipt['lines'][number];

export type ReceiptPart = NonNullable<ReceiptUploadData['body']>['parts'][number];
export type ReceiptMediaType = ReceiptPart['mediaType'];
