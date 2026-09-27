import type { UseMutationResult } from '@tanstack/react-query';

import type { CerebrumApiError } from '../../cerebrum-api-helpers';
import type {
  IngestQuickCaptureResponses,
  IngestSubmitResponses,
} from '../../cerebrum-api/types.gen';
import type { BulkSegmentOutcome } from './types';

export interface QuickCapturePayload {
  text: string;
  source: 'manual';
  scopes?: string[];
}

export type QuickCaptureResponse = IngestQuickCaptureResponses[200];

export interface SubmitPayload {
  body: string;
  title?: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
  template?: string;
  source: 'manual';
  customFields?: Record<string, unknown>;
}

export type SubmitResponse = IngestSubmitResponses[200];

export type QuickCaptureMutation = UseMutationResult<
  QuickCaptureResponse,
  CerebrumApiError,
  QuickCapturePayload
>;
export type SubmitMutation = UseMutationResult<SubmitResponse, CerebrumApiError, SubmitPayload>;
export type SetBulkResults = (
  next: BulkSegmentOutcome[] | ((prev: BulkSegmentOutcome[] | null) => BulkSegmentOutcome[] | null)
) => void;
