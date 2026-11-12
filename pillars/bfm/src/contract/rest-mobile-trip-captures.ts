import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileCaptureCreateSchema,
  MobileCaptureUpdateSchema,
  MobileCaptureAttachSchema,
  MobileCaptureUndoSchema,
  MobileCaptureResultSchema,
  MobileCaptureWorkspaceSchema,
} from './mobile-trip-capture-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobileRequestErrorSchema, MobileUpstreamErrorSchema } from './rest-schemas.js';

const c = initContract();
const pathParams = z.object({ tripId: z.coerce.number().int().positive() });
const errors = {
  ...MOBILE_REQUEST_RESPONSES,
  400: z.union([MobileRequestErrorSchema, MobileUpstreamErrorSchema]),
  ...MOBILE_PERIMETER_RESPONSES,
  ...MOBILE_UPSTREAM_RESPONSES,
  404: MobileUpstreamErrorSchema,
  409: MobileUpstreamErrorSchema,
};
/** Device-scoped canonical capture operations; no destructive source removal or implicit organisation. */
export const mobileTripCapturesContract = c.router({
  workspace: {
    method: 'GET',
    path: '/mobile/trips/:tripId/capture-workspace',
    pathParams,
    responses: { 200: MobileCaptureWorkspaceSchema, ...errors },
    metadata: requires('trips.read'),
  },
  create: {
    method: 'POST',
    path: '/mobile/trips/:tripId/captures/create',
    pathParams,
    body: MobileCaptureCreateSchema,
    responses: { 200: MobileCaptureResultSchema, ...errors },
    metadata: requires('trips.capture.write'),
  },
  update: {
    method: 'POST',
    path: '/mobile/trips/:tripId/captures/update',
    pathParams,
    body: MobileCaptureUpdateSchema,
    responses: { 200: MobileCaptureResultSchema, ...errors },
    metadata: requires('trips.capture.write'),
  },
  attach: {
    method: 'POST',
    path: '/mobile/trips/:tripId/captures/attach',
    pathParams,
    body: MobileCaptureAttachSchema,
    responses: { 200: MobileCaptureResultSchema, ...errors },
    metadata: requires('trips.capture.write'),
  },
  undo: {
    method: 'POST',
    path: '/mobile/trips/:tripId/captures/undo',
    pathParams,
    body: MobileCaptureUndoSchema,
    responses: { 200: MobileCaptureResultSchema, ...errors },
    metadata: requires('trips.capture.write'),
  },
});
