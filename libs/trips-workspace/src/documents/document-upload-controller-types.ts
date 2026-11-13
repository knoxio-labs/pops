import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { UploadJournal } from './durable-upload-journal';
import type { PaperlessTask, PaperlessUploadPolicy } from './types';
import type { DocumentUploadSession, UploadFields } from './useUploadFields';

/**
 * Controlled storage outlives conditional views. Each file intent binds its first owner transport;
 * create a new session when that owner changes rather than rebinding retained task proof.
 */
export interface DocumentUploadOptions {
  session: DocumentUploadSession;
  onSessionChange: Dispatch<SetStateAction<DocumentUploadSession>>;
  documentsClient?: DocumentsClient;
  /** Exact persistent account/owner/target journal; omitted uses the surrounding unbound Capture context. */
  journal?: UploadJournal;
  /** Revalidate a retaining parent's captured context immediately before owner operations. */
  beforeRequest?: () => void;
  /** Retaining parents supply their captured owner namespace rather than a mutable transport origin. */
  taskScope?: readonly [string, string];
}

/** The owner upload task and canonical result, without any Trips route association. */
export interface DocumentUploadController {
  /** Fence a separate owner picker or recovery callback with this intent's transport and parent context. */
  assertOwnerContext: () => void;
  fields: UploadFields;
  /** False while authenticated persistence is unavailable or this retained intent belongs to another epoch. */
  persistenceReady: boolean;
  actions: {
    uploadMutation: UseMutationResult<
      string,
      Error,
      { file: File | null; fields: UploadFields },
      unknown
    >;
    submitUpload: () => void;
    recoverSelection: () => void;
    reattachFile: (file: File) => void;
    searchCompleted: (count: number | null) => void;
  };
  policyQuery: UseQueryResult<PaperlessUploadPolicy, Error>;
  taskQuery: UseQueryResult<PaperlessTask, Error>;
  policy: PaperlessUploadPolicy | null;
  unavailable: boolean;
  documentId: number | undefined;
  taskFailed: boolean;
  error: string | null;
}
