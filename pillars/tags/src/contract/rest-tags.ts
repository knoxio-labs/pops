import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  CreateTagBody,
  ExpandTagsBody,
  ExpandTagsResponse,
  ListTagsQuery,
  MergeTagBody,
  TagListResponseSchema,
  TagSchema,
  UpdateTagBody,
} from './rest-tags-schemas.js';

const c = initContract();
const TagIdParams = z.object({ id: z.string().uuid() });

/** Unmounted routes for managing and expanding the shared tag vocabulary. */
export const tagsVocabularyContract = c.router({
  list: {
    method: 'GET',
    path: '/tags',
    query: ListTagsQuery,
    responses: { 200: TagListResponseSchema, 400: ErrorBodySchema },
    summary: 'List shared tags with optional facet, archive, and update-time filters',
  },
  get: {
    method: 'GET',
    path: '/tags/:id',
    pathParams: TagIdParams,
    responses: { 200: TagSchema, 404: ErrorBodySchema },
    summary: 'Get one shared tag by id',
  },
  create: {
    method: 'POST',
    path: '/tags',
    body: CreateTagBody,
    responses: {
      200: TagSchema,
      201: TagSchema,
      400: ErrorBodySchema,
      409: ErrorBodySchema,
      422: ErrorBodySchema,
    },
    summary: 'Create a shared tag or return the matching existing tag',
  },
  update: {
    method: 'PATCH',
    path: '/tags/:id',
    pathParams: TagIdParams,
    body: UpdateTagBody,
    responses: {
      200: TagSchema,
      400: ErrorBodySchema,
      404: ErrorBodySchema,
      409: ErrorBodySchema,
      422: ErrorBodySchema,
    },
    summary: 'Update a shared tag name, parent, description, or date window',
  },
  archive: {
    method: 'POST',
    path: '/tags/:id/archive',
    pathParams: TagIdParams,
    body: z.object({}).optional(),
    responses: { 200: TagSchema, 404: ErrorBodySchema },
    summary: 'Archive a shared tag without deleting it',
  },
  unarchive: {
    method: 'POST',
    path: '/tags/:id/unarchive',
    pathParams: TagIdParams,
    body: z.object({}).optional(),
    responses: { 200: TagSchema, 404: ErrorBodySchema, 409: ErrorBodySchema },
    summary: 'Restore an archived shared tag',
  },
  merge: {
    method: 'POST',
    path: '/tags/:id/merge',
    pathParams: TagIdParams,
    body: MergeTagBody,
    responses: {
      200: TagSchema,
      400: ErrorBodySchema,
      404: ErrorBodySchema,
      409: ErrorBodySchema,
      422: ErrorBodySchema,
    },
    summary: 'Merge a shared tag into another tag',
  },
  expand: {
    method: 'POST',
    path: '/tags/expand',
    body: ExpandTagsBody,
    responses: { 200: ExpandTagsResponse, 400: ErrorBodySchema },
    summary: 'Expand tag ids to include descendants and merged entries',
  },
});
