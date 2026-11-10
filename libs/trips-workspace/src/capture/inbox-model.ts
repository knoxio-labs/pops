import type { Capture, CaptureSource } from './types';

/** Organisation requires a live explicit local target; unresolved external owner references remain distinguishable. */
export function captureOrganisation(
  capture: Capture,
  source: CaptureSource
): 'unorganised' | 'organised' | 'unresolved' {
  const associations = source.associations.filter(
    (row) => row.captureId === capture.id && row.removedAt === null
  );
  if (associations.some((row) => localTargetExists(row.target, source))) return 'organised';
  return associations.length > 0 ? 'unresolved' : 'unorganised';
}
function localTargetExists(
  target: CaptureSource['associations'][number]['target'],
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
    case 'contact':
      return false;
  }
}
