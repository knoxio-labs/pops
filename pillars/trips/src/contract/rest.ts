import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import { decisionsContract, decisionOptionsContract } from './decisions.js';
import { documentAssociationsContract } from './document-associations.js';
import { eventsContract } from './events.js';
import { journeyGroupsContract } from './journey-groups.js';
import { journeysContract, journeyLegsContract } from './journeys.js';
import {
  CreatePlaceBody,
  CreateTripBody,
  CreateVisitBody,
  PlaceSchema,
  ReorderVisitsBody,
  TripSchema,
  UpdatePlaceBody,
  UpdateTripBody,
  UpdateVisitBody,
  VisitSchema,
} from './schemas.js';
import { staysContract } from './stays.js';

const c = initContract();
const IdParams = z.object({ id: z.coerce.number().int().positive() });
const TripParams = z.object({ tripId: z.coerce.number().int().positive() });
const VisitParams = TripParams.extend({ id: z.coerce.number().int().positive() });
const errors = { 400: ErrorBodySchema, 404: ErrorBodySchema };
const VisitList = z.object({ visits: z.array(VisitSchema) });

/** Trips-owned source metadata and route identity contract; ordering never rewrites dates. */
export const tripsContract = c.router(
  {
    events: eventsContract,
    decisions: decisionsContract,
    decisionOptions: decisionOptionsContract,
    stays: staysContract,
    documentAssociations: documentAssociationsContract,
    journeyGroups: journeyGroupsContract,
    journeys: journeysContract,
    journeyLegs: journeyLegsContract,
    trips: c.router({
      list: {
        method: 'GET',
        path: '/trips',
        responses: { 200: z.object({ trips: z.array(TripSchema) }), 400: ErrorBodySchema },
      },
      get: {
        method: 'GET',
        path: '/trips/:id',
        pathParams: IdParams,
        responses: { 200: TripSchema, ...errors },
      },
      create: {
        method: 'POST',
        path: '/trips',
        body: CreateTripBody,
        responses: { 201: TripSchema, 400: ErrorBodySchema, 503: ErrorBodySchema },
      },
      update: {
        method: 'PATCH',
        path: '/trips/:id',
        pathParams: IdParams,
        body: UpdateTripBody,
        responses: { 200: TripSchema, ...errors, 503: ErrorBodySchema },
      },
    }),
    places: c.router({
      list: {
        method: 'GET',
        path: '/places',
        responses: { 200: z.object({ places: z.array(PlaceSchema) }), 400: ErrorBodySchema },
      },
      get: {
        method: 'GET',
        path: '/places/:id',
        pathParams: IdParams,
        responses: { 200: PlaceSchema, ...errors },
      },
      create: {
        method: 'POST',
        path: '/places',
        body: CreatePlaceBody,
        responses: { 201: PlaceSchema, 400: ErrorBodySchema },
      },
      update: {
        method: 'PATCH',
        path: '/places/:id',
        pathParams: IdParams,
        body: UpdatePlaceBody,
        responses: { 200: PlaceSchema, ...errors },
      },
    }),
    visits: c.router({
      list: {
        method: 'GET',
        path: '/trips/:tripId/visits',
        pathParams: TripParams,
        responses: { 200: VisitList, ...errors },
      },
      get: {
        method: 'GET',
        path: '/trips/:tripId/visits/:id',
        pathParams: VisitParams,
        responses: { 200: VisitSchema, ...errors },
      },
      create: {
        method: 'POST',
        path: '/trips/:tripId/visits',
        pathParams: TripParams,
        body: CreateVisitBody,
        responses: { 201: VisitSchema, ...errors },
      },
      update: {
        method: 'PATCH',
        path: '/trips/:tripId/visits/:id',
        pathParams: VisitParams,
        body: UpdateVisitBody,
        responses: { 200: VisitSchema, ...errors },
      },
      reorder: {
        method: 'PUT',
        path: '/trips/:tripId/visit-order',
        pathParams: TripParams,
        body: ReorderVisitsBody,
        responses: { 200: VisitList, ...errors },
      },
    }),
  },
  { pathPrefix: '', strictStatusCodes: false }
);
