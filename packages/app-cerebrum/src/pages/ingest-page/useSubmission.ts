/**
 * Sub-hook: routes the capture surface to the appropriate API path.
 *
 * - When no Advanced fields have been touched and the body has no `---`
 *   separators, calls `cerebrum.ingest.quickCapture` (US-01 single capture).
 * - When the body contains `---` separators (or the user forced a split via
 *   Cmd/Ctrl+Shift+Enter), calls `quickCapture` once per non-empty segment
 *   sequentially (US-08 bulk paste).
 * - When Advanced has been touched, calls `cerebrum.ingest.submit` (single).
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import type { BulkSegment } from './bulk-paste';
import type { BulkSegmentOutcome, IngestFormValues, SubmitResult } from './types';
import type { useFormState } from './useFormState';

type FormState = ReturnType<typeof useFormState>;
type QuickCaptureMutation = ReturnType<typeof trpc.cerebrum.ingest.quickCapture.useMutation>;
type QuickCaptureResponse = Awaited<ReturnType<QuickCaptureMutation['mutateAsync']>>;
type SetBulkResults = (
  next: BulkSegmentOutcome[] | ((prev: BulkSegmentOutcome[] | null) => BulkSegmentOutcome[] | null)
) => void;

function buildSubmitPayload(form: IngestFormValues) {
  return {
    body: form.body,
    title: form.title || undefined,
    type: form.type || undefined,
    scopes: form.scopes.length > 0 ? form.scopes : undefined,
    tags: form.tags.length > 0 ? form.tags : undefined,
    template: form.template || undefined,
    source: 'manual' as const,
    customFields: Object.keys(form.customFields).length > 0 ? form.customFields : undefined,
  };
}

function buildQuickCapturePayload(form: IngestFormValues, body: string = form.body) {
  return {
    text: body,
    source: 'manual' as const,
    scopes: form.scopes.length > 0 ? form.scopes : undefined,
  };
}

function asResult(r: QuickCaptureResponse): SubmitResult {
  return { id: r.id, filePath: r.path, type: r.type };
}

export function useSubmission(formState: FormState) {
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkSegmentOutcome[] | null>(null);
  const [bulkInFlight, setBulkInFlight] = useState(false);

  const submitMutation = trpc.cerebrum.ingest.submit.useMutation({
    onSuccess: (result) => setSubmitResult(asResult(toQuickCaptureShape(result))),
    onError: (error) => toast.error('Submit Engram failed', { description: error.message }),
  });

  const quickCaptureMutation = trpc.cerebrum.ingest.quickCapture.useMutation({
    onError: (error) => toast.error('Capture failed', { description: error.message }),
  });

  const handleSubmit = useCallback(
    (options?: { forceBulk?: boolean }) => {
      void dispatchSubmit({
        formState,
        submitMutation,
        quickCaptureMutation,
        forceBulk: options?.forceBulk ?? false,
        setSubmitResult,
        setBulkResults,
        setBulkInFlight,
      });
    },
    [formState, submitMutation, quickCaptureMutation]
  );

  const retrySegment = useCallback(
    (segmentIndex: number) =>
      retrySegmentImpl({
        segmentIndex,
        formValues: formState.form,
        bulkResults,
        mutateAsync: quickCaptureMutation.mutateAsync,
        setBulkResults,
      }),
    [bulkResults, formState.form, quickCaptureMutation]
  );

  const resetForm = useCallback(() => {
    formState.resetForm();
    setSubmitResult(null);
    setBulkResults(null);
  }, [formState]);

  const isSubmitting = submitMutation.isPending || quickCaptureMutation.isPending || bulkInFlight;
  const submitError = submitMutation.error?.message ?? null;

  return {
    handleSubmit,
    retrySegment,
    isSubmitting,
    submitError,
    submitResult,
    bulkResults,
    resetForm,
  };
}

/**
 * The submit endpoint returns `{ engram: { id, filePath, type }, ... }` while
 * quickCapture returns `{ id, path, type, scopes }`. Normalise to the latter
 * so `asResult` is the single shape converter.
 */
function toQuickCaptureShape(submitResponse: {
  engram: { id: string; filePath: string; type: string };
}): QuickCaptureResponse {
  return {
    id: submitResponse.engram.id,
    path: submitResponse.engram.filePath,
    type: submitResponse.engram.type,
    scopes: [],
  };
}

interface DispatchArgs {
  formState: FormState;
  submitMutation: ReturnType<typeof trpc.cerebrum.ingest.submit.useMutation>;
  quickCaptureMutation: QuickCaptureMutation;
  forceBulk: boolean;
  setSubmitResult: (next: SubmitResult | null) => void;
  setBulkResults: SetBulkResults;
  setBulkInFlight: (next: boolean) => void;
}

async function dispatchSubmit(args: DispatchArgs): Promise<void> {
  const { formState, submitMutation, quickCaptureMutation, forceBulk } = args;
  const { form, advancedTouched, segments } = formState;
  if (advancedTouched) {
    submitMutation.mutate(buildSubmitPayload(form));
    return;
  }
  if ((forceBulk || segments.length > 1) && segments.length > 0) {
    await runBulk({
      form,
      segments,
      mutateAsync: quickCaptureMutation.mutateAsync,
      setBulkResults: args.setBulkResults,
      setBulkInFlight: args.setBulkInFlight,
    });
    return;
  }
  const r = await quickCaptureMutation.mutateAsync(buildQuickCapturePayload(form));
  args.setSubmitResult(asResult(r));
}

interface RunBulkArgs {
  form: IngestFormValues;
  segments: BulkSegment[];
  mutateAsync: QuickCaptureMutation['mutateAsync'];
  setBulkResults: SetBulkResults;
  setBulkInFlight: (next: boolean) => void;
}

async function runBulk(args: RunBulkArgs): Promise<void> {
  const { form, segments, mutateAsync, setBulkResults, setBulkInFlight } = args;
  setBulkInFlight(true);
  setBulkResults(segments.map((s) => ({ index: s.index, preview: s.preview, body: s.body })));
  for (const seg of segments) {
    await runSegment({ form, segment: seg, mutateAsync, setBulkResults });
  }
  setBulkInFlight(false);
}

interface RunSegmentArgs {
  form: IngestFormValues;
  segment: BulkSegment;
  mutateAsync: QuickCaptureMutation['mutateAsync'];
  setBulkResults: SetBulkResults;
}

async function runSegment(args: RunSegmentArgs): Promise<void> {
  const { form, segment, mutateAsync, setBulkResults } = args;
  try {
    const r = await mutateAsync(buildQuickCapturePayload(form, segment.body));
    setBulkResults((prev) =>
      prev ? prev.map((b) => (b.index === segment.index ? { ...b, result: asResult(r) } : b)) : null
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Capture failed';
    setBulkResults((prev) =>
      prev ? prev.map((b) => (b.index === segment.index ? { ...b, error: message } : b)) : null
    );
  }
}

interface RetrySegmentArgs {
  segmentIndex: number;
  formValues: IngestFormValues;
  bulkResults: BulkSegmentOutcome[] | null;
  mutateAsync: QuickCaptureMutation['mutateAsync'];
  setBulkResults: SetBulkResults;
}

async function retrySegmentImpl(args: RetrySegmentArgs): Promise<void> {
  const { segmentIndex, formValues, bulkResults, mutateAsync, setBulkResults } = args;
  const target = bulkResults?.find((b) => b.index === segmentIndex);
  if (!target) return;
  try {
    const r = await mutateAsync(buildQuickCapturePayload(formValues, target.body));
    setBulkResults((prev) =>
      prev
        ? prev.map((b) =>
            b.index === segmentIndex ? { ...b, result: asResult(r), error: undefined } : b
          )
        : null
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Capture failed';
    setBulkResults((prev) =>
      prev
        ? prev.map((b) =>
            b.index === segmentIndex ? { ...b, error: message, result: undefined } : b
          )
        : null
    );
  }
}
