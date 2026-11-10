import { useQuery } from '@tanstack/react-query';

import { Button, ErrorState } from '@pops/ui';

import { loadPaperlessDocument, loadPaperlessTask, paperlessOriginalUrl } from '../documents/api';
import { documentQueryKeys } from '../documents/query-keys';
import { UploadTaskStatus } from '../documents/UploadTaskStatus';
import { requestProblem } from '../stay/api';

import type { JSX } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { CaptureEditor } from './editor-types';
import type { Capture } from './types';

type Props = {
  capture: Capture;
  editor: CaptureEditor;
  documentsClient?: DocumentsClient;
  busy: boolean;
};

/** Resolve accepted owner identities without treating metadata as browser file bytes or deleting originals. */
export function CaptureAttachments(props: Props): JSX.Element {
  return (
    <div className="space-y-2">
      {attachmentRows(props.capture).map(({ reference, key }) =>
        reference.kind === 'task' ? (
          <TaskOriginal key={key} {...props} taskId={reference.taskId} />
        ) : (
          <DocumentOriginal
            key={key}
            documentId={reference.documentId}
            taskId={reference.taskId}
            documentsClient={props.documentsClient}
          />
        )
      )}
    </div>
  );
}
function TaskOriginal({
  capture,
  editor,
  documentsClient,
  busy,
  taskId,
}: Props & { taskId: string }): JSX.Element {
  const task = useQuery({
    queryKey: documentQueryKeys.task(documentsClient, taskId),
    queryFn: () => loadPaperlessTask(taskId, documentsClient),
    retry: false,
  });
  const completed = task.data?.state === 'done' || task.data?.state === 'duplicate';
  const documentId = completed ? task.data?.documentId : null;
  const linked = capture.attachments.some(
    (reference) =>
      reference.kind === 'document' &&
      reference.taskId === taskId &&
      reference.documentId === documentId
  );
  return (
    <section
      className="space-y-2 rounded-md border border-border p-3"
      aria-label={`Documents task ${taskId}`}
    >
      <p className="break-words text-sm">Documents task {taskId}</p>
      <UploadTaskStatus task={task.data} error={task.isError} onRetry={() => void task.refetch()} />
      <Button variant="ghost" onClick={() => void task.refetch()}>
        Check task status
      </Button>
      {documentId !== null && documentId !== undefined && !linked ? (
        <Button
          disabled={busy}
          onClick={() =>
            void editor.commit(
              {
                kind: 'capture.attach',
                id: capture.id,
                expectedRevision: capture.revision,
                attachment: { kind: 'document', documentId, taskId },
              },
              'Link original'
            )
          }
        >
          Link original {documentId}
        </Button>
      ) : null}
    </section>
  );
}
function DocumentOriginal({
  documentId,
  taskId,
  documentsClient,
}: {
  documentId: number;
  taskId?: string;
  documentsClient?: DocumentsClient;
}): JSX.Element {
  const original = useQuery({
    queryKey: documentQueryKeys.document(documentsClient, documentId),
    queryFn: () => loadPaperlessDocument(documentId, documentsClient),
    retry: false,
  });
  return (
    <section
      className="space-y-2 rounded-md border border-border p-3"
      aria-label={`Documents original ${documentId}`}
    >
      <a
        className="inline-flex min-h-11 items-center gap-2 break-words text-sm underline"
        href={paperlessOriginalUrl(documentId)}
        target="_blank"
        rel="noreferrer"
      >
        {original.data?.title ?? `Documents original ${documentId}`}
      </a>
      {taskId ? (
        <p className="break-words text-xs text-muted-foreground">From Documents task {taskId}</p>
      ) : null}
      {original.isError ? (
        <ErrorState
          error={requestProblem(original.error)}
          onRetry={() => void original.refetch()}
        />
      ) : null}
    </section>
  );
}

function attachmentRows(
  capture: Capture
): { reference: Capture['attachments'][number]; key: string }[] {
  const occurrences = new Map<string, number>();
  return capture.attachments.map((reference) => {
    const identity = JSON.stringify(reference);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { reference, key: `${identity}:${occurrence}` };
  });
}
