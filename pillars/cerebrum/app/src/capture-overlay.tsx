/**
 * The capture-overlay surface: the ingest form, mounted inside the shell's
 * capture modal rather than under a route.
 *
 * It used to live in the shell's `bundle-map.tsx`, which imported
 * `IngestForm` and `useIngestPageModel` out of this package to assemble it.
 * That only worked while the shell compiled this app in. A loader-mounted
 * pillar ships every surface it contributes inside its own bundle, so the
 * assembly moves here and the shell resolves it by slot (POPS-3225).
 */
import { useEffect } from 'react';

import { IngestForm } from './components/IngestForm';
import { useIngestPageModel } from './pages/ingest-page/useIngestPageModel';

/**
 * Props the shell passes to a capture-overlay mount.
 *
 * Restated here rather than imported: this app must not depend on the shell,
 * and a devDependency added to borrow one interface is the same edge wearing
 * a different label. The shell's `CaptureOverlayMountProps` is the canonical
 * definition; the two are held together by the overlay actually mounting,
 * which `pillars/shell/e2e/cerebrum-via-loader.spec.ts` asserts.
 */
export interface CaptureOverlayMountProps {
  readonly onUnsavedChange: (next: boolean) => void;
}

/**
 * Report the form's unsaved state upward whenever it flips, so the modal can
 * gate Esc and backdrop-close without reaching into this app's state.
 */
function useUnsavedSignal(hasUnsaved: boolean, onChange: (next: boolean) => void): void {
  useEffect(() => {
    onChange(hasUnsaved);
  }, [hasUnsaved, onChange]);
}

export function IngestCaptureOverlay({ onUnsavedChange }: CaptureOverlayMountProps) {
  const model = useIngestPageModel();
  const hasUnsaved = model.form.body.length > 0 && !model.bulkResults && !model.submitResult;
  useUnsavedSignal(hasUnsaved, onUnsavedChange);
  return <IngestForm model={model} />;
}
