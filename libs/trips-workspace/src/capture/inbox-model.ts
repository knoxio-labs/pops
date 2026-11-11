import type { Capture, CaptureSource } from './types';

/** Preserve live-target organisation while distinguishing missing local sources from unverified external owners. */
export function captureOrganisation(
  capture: Capture,
  source: CaptureSource,
  contactAvailability: (uri: string) => 'available' | 'missing' | 'unverified' = () => 'unverified'
): 'unorganised' | 'organised' | 'unresolved' | 'unverified' {
  const associations = source.associations.filter(
    (row) => row.captureId === capture.id && row.removedAt === null
  );
  const availability = associations.map((row) =>
    captureTargetAvailability(row.target, source, contactAvailability)
  );
  if (availability.includes('available')) return 'organised';
  if (availability.includes('unverified')) return 'unverified';
  return associations.length > 0 ? 'unresolved' : 'unorganised';
}
/** Report source presence independently of association existence; no Contacts read means unverified, never missing. */
export function captureTargetAvailability(
  target: CaptureSource['associations'][number]['target'],
  source: CaptureSource,
  contactAvailability: (uri: string) => 'available' | 'missing' | 'unverified' = () => 'unverified'
): 'available' | 'missing' | 'unverified' {
  if (target.kind === 'contact') return contactAvailability(target.reference.uri);
  return localTargetExists(target, source) ? 'available' : 'missing';
}
function localTargetExists(
  target: Exclude<CaptureSource['associations'][number]['target'], { kind: 'contact' }>,
  source: CaptureSource
): boolean {
  switch (target.kind) {
    case 'idea':
      return source.ideas.some((row) => row.id === target.id && row.removedAt === null);
    case 'event':
      return source.events.some((row) => row.id === target.id);
    case 'journey':
      return source.journeys.some((row) => row.id === target.id);
    case 'stay':
      return source.stays.some((row) => row.id === target.id);
  }
}
