import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Entity } from '../contacts-api/types.gen';
import type { DuplicateMergeGateway } from './api';

/** Track the selected pair, provenance queries and explicit merge confirmation. */
export function useDuplicateReview(gateway: DuplicateMergeGateway, saveFailedMessage: string) {
  const [source, setSource] = useState<Entity | null>(null);
  const [canonical, setCanonical] = useState<Entity | null>(null);
  const [sourcePicker, setSourcePicker] = useState(false);
  const [canonicalPicker, setCanonicalPicker] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [preview, setPreview] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const sourceQuery = useDuplicateSource(gateway, source, 'source');
  const canonicalQuery = useDuplicateSource(gateway, canonical, 'canonical');

  function updateSelection(setSelection: (entity: Entity) => void, entity: Entity) {
    setSelection(entity);
    setPreview(false);
    setSaved(false);
    setIdempotencyKey(crypto.randomUUID());
  }

  const { saving, saved, setSaved, error, apply } = useDuplicateMerge({
    gateway,
    source,
    canonical,
    evidence,
    idempotencyKey,
    setPreview,
    saveFailedMessage,
  });

  function changeEvidence(value: string) {
    setEvidence(value);
    setPreview(false);
    setIdempotencyKey(crypto.randomUUID());
  }

  return {
    source,
    canonical,
    sourcePicker,
    canonicalPicker,
    evidence,
    preview,
    saving,
    saved,
    error,
    sourceQuery,
    canonicalQuery,
    canPreview: canPreviewMerge({
      source,
      canonical,
      evidence,
      loading: sourceQuery.isLoading || canonicalQuery.isLoading,
      saving,
      saved,
    }),
    setSourcePicker,
    setCanonicalPicker,
    setPreview,
    changeEvidence,
    apply,
    chooseSource: (entity: Entity) => updateSelection(setSource, entity),
    chooseCanonical: (entity: Entity) => updateSelection(setCanonical, entity),
  };
}

function useDuplicateMerge({
  gateway,
  source,
  canonical,
  evidence,
  idempotencyKey,
  setPreview,
  saveFailedMessage,
}: {
  gateway: DuplicateMergeGateway;
  source: Entity | null;
  canonical: Entity | null;
  evidence: string;
  idempotencyKey: string;
  setPreview: (preview: boolean) => void;
  saveFailedMessage: string;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function apply() {
    if (!source || !canonical || !evidence.trim() || source.id === canonical.id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await gateway.merge(canonical.id, source.id, evidence.trim(), idempotencyKey);
      setSaved(true);
      setPreview(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error(saveFailedMessage));
    } finally {
      setSaving(false);
    }
  }

  return { saving, saved, setSaved, error, apply };
}

/** State and actions used by the source-first merge workspace. */
export type DuplicateReview = ReturnType<typeof useDuplicateReview>;

function useDuplicateSource(
  gateway: DuplicateMergeGateway,
  entity: Entity | null,
  role: 'source' | 'canonical'
) {
  return useQuery({
    queryKey: [`contacts-duplicate-${role}`, entity?.id],
    queryFn: () => gateway.load(entity?.id ?? ''),
    enabled: Boolean(entity),
    retry: false,
  });
}

function canPreviewMerge({
  source,
  canonical,
  evidence,
  loading,
  saving,
  saved,
}: {
  source: Entity | null;
  canonical: Entity | null;
  evidence: string;
  loading: boolean;
  saving: boolean;
  saved: boolean;
}) {
  return Boolean(
    source &&
    canonical &&
    source.id !== canonical.id &&
    evidence.trim() &&
    !loading &&
    !saving &&
    !saved
  );
}
