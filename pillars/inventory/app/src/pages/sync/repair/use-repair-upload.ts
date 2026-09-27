import { createElement, useCallback, useState } from 'react';

import { usePhotoUploads } from '../../../foundation/photos/use-photo-uploads.js';

import type { ChangeEvent, ReactElement } from 'react';

import type { PhotoUploadResult } from '../../../foundation/photos/use-photo-uploads.js';
import type { RepairOutcome } from './repair-outcome.js';

interface RepairUpload {
  busy: boolean;
  refusal: string | null;
  outcome: RepairOutcome | null;
  fileInput: ReactElement;
  open: () => void;
}

function uploadRefusal(result: PhotoUploadResult | undefined): string | null {
  if (result === undefined || result.status === 'refused' || result.status === 'failed') {
    return `Not saved. ${result?.reason ?? 'The photo was refused.'}`;
  }
  return null;
}

/** Manages the single photo picker used by a Sync repair action. */
export function useRepairUpload(input: {
  itemId: string;
  existingPhotoCount: number;
}): RepairUpload {
  const uploads = usePhotoUploads('edit', input.itemId, input.existingPhotoCount);
  const [fileInputNode, setFileInputNode] = useState<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RepairOutcome | null>(null);

  const upload = useCallback(
    async (file: File): Promise<void> => {
      setRefusal(null);
      setOutcome(null);
      setBusy(true);
      try {
        const [result] = await uploads.add([file]);
        setRefusal(uploadRefusal(result));
        if (result?.status === 'attached') {
          setOutcome({ kind: 'follow-up', message: 'Photo sent', at: new Date().toISOString() });
        }
      } catch (error: unknown) {
        setRefusal(`Not saved. ${error instanceof Error ? error.message : 'The upload failed.'}`);
      } finally {
        setBusy(false);
      }
    },
    [uploads]
  );

  const onFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file !== undefined) void upload(file);
    },
    [upload]
  );
  const open = useCallback((): void => fileInputNode?.click(), [fileInputNode]);
  const fileInput = createElement('input', {
    ref: setFileInputNode,
    type: 'file',
    accept: 'image/*,.heic,.heif',
    'aria-label': 'Choose a photo',
    className: 'hidden',
    onChange: onFileChange,
  });

  return { busy, refusal, outcome, fileInput, open };
}
