import type { CaptureTarget } from '../../contract/source-workspace.js';

/** Compare explicit typed identities; Contact identity is the exact owner reference rather than a display name. */
export function sameCaptureTarget(first: CaptureTarget, second: CaptureTarget): boolean {
  if (first.kind !== second.kind) return false;
  if (first.kind === 'contact')
    return second.kind === 'contact' && first.reference.uri === second.reference.uri;
  return second.kind !== 'contact' && first.id === second.id;
}
