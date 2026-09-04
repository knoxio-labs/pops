/**
 * Logo upload/remove mutations for the institution edit dialog. Split out of
 * `useInstitutionsSettings` because the dialog needs the freshly-updated
 * institution row back (to show the new logo without closing), which is a
 * different success shape from the name/colour PATCH the settings list
 * re-fetches for. Mirrors food's `useHeroMutations` — base64-encode the file,
 * POST it, map the response back onto local state.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import { institutionsRemoveLogo, institutionsUploadLogo } from '../../finance-api/index.js';
import { type Institution } from './types';

import type { InstitutionsUploadLogoData } from '../../finance-api/types.gen.js';

type UploadLogoBody = NonNullable<InstitutionsUploadLogoData['body']>;

const INSTITUTIONS_KEY = ['finance', 'institutions', 'list'];

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const reader = new FileReader();
    reader.onerror = () => rejectPromise(reader.error ?? new Error('FileReader failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        rejectPromise(new Error('FileReader did not return a string'));
        return;
      }
      // result is "data:<mime>;base64,<payload>" — strip the prefix.
      const commaIdx = result.indexOf(',');
      resolvePromise(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * @param onChanged Receives the institution row the server returned. It can
 * fire long after the dialog that started the mutation has moved on to another
 * institution — or closed — so the caller must reconcile the row's identity
 * against whatever it is currently editing rather than applying it blindly.
 */
export function useInstitutionLogoMutations(onChanged: (institution: Institution) => void) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: INSTITUTIONS_KEY });

  const uploadMutation = useMutation({
    mutationFn: async (args: { institutionId: string; body: UploadLogoBody }) =>
      unwrap(await institutionsUploadLogo({ path: { id: args.institutionId }, body: args.body })),
    onSuccess: (res) => {
      onChanged(res.data);
      toast.success('Logo uploaded');
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (institutionId: string) =>
      unwrap(await institutionsRemoveLogo({ path: { id: institutionId } })),
    onSuccess: (res) => {
      onChanged(res.data);
      toast.success('Logo removed');
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const uploadLogo = useCallback(
    async (institutionId: string, file: File) => {
      try {
        const contentBase64 = await readAsBase64(file);
        uploadMutation.mutate({
          institutionId,
          body: { contentType: file.type as UploadLogoBody['contentType'], contentBase64 },
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not read the selected file.');
      }
    },
    [uploadMutation]
  );

  return {
    uploadLogo,
    removeLogo: removeMutation.mutate,
    uploadIsPending: uploadMutation.isPending,
    removeIsPending: removeMutation.isPending,
  };
}
