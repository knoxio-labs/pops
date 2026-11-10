import type { CaptureSource } from '@pops/trips-workspace/capture-client';

import type { PlacesListResponses, VisitsListResponses } from './trips-api/types.gen';

/** Fictional colliding Capture/Idea IDs make owner labels observable without name-based identity. */
export function captureReadSource(title: string): CaptureSource {
  return {
    captures: [
      {
        id: 19,
        tripId: 1,
        originalText: 'Raw source',
        originalUrl: null,
        title,
        notes: '',
        classification: null,
        placeId: null,
        visitId: null,
        attachments: [],
        revision: 1,
        removedAt: null,
        createdAt: '',
        updatedAt: '',
      },
    ],
    ideas: [
      {
        id: 19,
        tripId: 1,
        name: `${title} Idea`,
        kind: null,
        purpose: null,
        status: null,
        reason: '',
        notes: '',
        address: null,
        placeId: null,
        visitId: null,
        timing: { mode: 'none' },
        sourceLinks: [],
        contactLinks: [],
        recommendations: [],
        revision: 1,
        removedAt: null,
        createdAt: '',
        updatedAt: '',
      },
    ],
    associations: [],
    memberships: [],
    events: [],
    journeys: [],
    stays: [],
  };
}

/** Identical place IDs across fictional owners carry deliberately different display labels. */
export function captureReadPlaces(name: string): PlacesListResponses[200]['places'] {
  return [
    {
      id: 9,
      name,
      sourceLinks: [],
      createdAt: '',
      updatedAt: '',
    },
  ];
}

/** Explicit fixture occurrence IDs keep foreign Visit options distinguishable. */
export function captureReadVisits(id: number): VisitsListResponses[200]['visits'] {
  return [
    {
      id,
      tripId: 1,
      placeId: 9,
      revision: 0,
      notes: '',
      sourceLinks: [],
      timing: {},
      createdAt: '',
      updatedAt: '',
    },
  ];
}
