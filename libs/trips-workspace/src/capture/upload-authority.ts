import { ApiError } from '@pops/pillar-sdk/client';

import { client as defaultDocumentsClient } from '../documents-api/client.gen';
import { documentOwnerUrl } from '../documents/document-owner-url';
import { client as defaultTripsClient } from '../trips-api/client.gen';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { DocumentUploadSession } from '../documents/document-upload-session';
import type { UploadJournal } from '../documents/durable-upload-journal';
import type {
  CaptureAttachment,
  CaptureIdentity,
  CapturePerformer,
  CaptureRequest,
  CaptureResult,
} from './types';

/** A local refusal before this dispatch; a prior dispatched attempt must retain its unresolved operation lock. */
export class CaptureUploadContextError extends ApiError {
  constructor(readonly priorDispatch: boolean) {
    super({
      code: 'trips.capture.upload_context_invalid',
      kind: 'client',
      message: 'Verify the original upload account and server before capturing these files.',
      retryable: false,
    });
  }
}

type Context = {
  journal: UploadJournal | null;
  identity: CaptureIdentity;
  documentsClient?: DocumentsClient;
};
type Guard = { upload: DocumentUploadSession; binding: string };

/** Bind only managed upload references to their original account/epoch at every Capture dispatch, retry and owned Undo. */
export class CaptureUploadAuthority {
  private context: Context | null = null;
  private readonly requests = new Map<string, readonly Guard[]>();
  private readonly dispatched = new Set<string>();

  constructor(
    private readonly selected: () => readonly DocumentUploadSession[],
    private readonly known: () => readonly DocumentUploadSession[]
  ) {}

  /** Publish the current view authority without changing any retained File, receipt, draft or request. */
  bind(
    journal: UploadJournal | null,
    identity: CaptureIdentity,
    documentsClient?: DocumentsClient
  ): void {
    this.context = { journal, identity, documentsClient };
  }

  /** Reverify the exact originating principal and recheck all transports immediately before the existing performer. */
  async perform(request: CaptureRequest, perform: CapturePerformer): Promise<CaptureResult> {
    const guards = this.requestGuards(request);
    if (guards.length === 0) return perform(request);
    const context = this.context;
    const journal = this.assertContext(context, guards, request.operationId);
    try {
      await journal.verify();
    } catch {
      throw this.refusal(request.operationId);
    }
    this.assertContext(context, guards, request.operationId);
    this.dispatched.add(request.operationId);
    return perform(request);
  }

  private refusal(operationId: string): CaptureUploadContextError {
    return new CaptureUploadContextError(this.dispatched.has(operationId));
  }

  private requestGuards(request: CaptureRequest): readonly Guard[] {
    const prior = this.requests.get(request.operationId);
    if (prior !== undefined) return prior;
    if ('scope' in request) {
      const guards = this.requests.get(request.command.targetOperationId) ?? [];
      this.requests.set(request.operationId, guards);
      return guards;
    }
    const selected = this.selected();
    let references: readonly CaptureAttachment[] = [];
    if (request.command.kind === 'capture.create')
      references = request.command.input.attachments ?? [];
    if (request.command.kind === 'capture.attach') references = [request.command.attachment];
    const guards = this.known()
      .filter((upload) => {
        if (request.command.kind === 'capture.create' && selected.includes(upload)) return true;
        return references.some(
          (reference) =>
            reference.taskId !== undefined &&
            reference.taskId === upload.intent.durable.readRecord()?.taskId
        );
      })
      .map((upload) => ({ upload, binding: upload.intent.durable.persistenceBinding() ?? '' }));
    this.requests.set(request.operationId, guards);
    return guards;
  }

  private assertContext(
    context: Context | null,
    guards: readonly Guard[],
    operationId: string
  ): UploadJournal {
    const current = this.context;
    if (
      context === null ||
      current === null ||
      context.journal === null ||
      current.journal === null ||
      current.journal.bindingKey() !== context.journal.bindingKey()
    )
      throw this.refusal(operationId);
    try {
      const journal = context.journal;
      journal.assertCapture(
        current.identity.tripId,
        documentOwnerUrl((current.identity.client ?? defaultTripsClient).getConfig().baseUrl)
      );
      journal.assertDocumentsOwner(
        documentOwnerUrl((current.documentsClient ?? defaultDocumentsClient).getConfig().baseUrl)
      );
      for (const guard of guards) {
        if (
          guard.binding !== journal.bindingKey() ||
          guard.upload.intent.durable.ownerMatches() === false
        )
          throw this.refusal(operationId);
        guard.upload.intent.assertOwner(current.documentsClient);
      }
      return journal;
    } catch {
      throw this.refusal(operationId);
    }
  }
}
