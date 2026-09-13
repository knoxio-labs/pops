/**
 * `containers.*` sub-router — a box's CRUD plus its lifecycle actions
 * (seal / move / unpack) and a read of what is inside it.
 *
 * `move` is the operation that relocates everything inside a container in
 * one write to `home_inventory` rather than one per item — see
 * `containersService.moveContainer`.
 *
 * `items` and `seal`/`move`/`unpack` sit under 3-segment paths
 * (`/containers/:id/items`, `/containers/:id/move`, …) so they can never
 * be shadowed by the 2-segment `/containers/:id` route.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { InventoryItemSchema } from './rest-items.js';
import { ERR_RESPONSES, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';

const c = initContract();

export const ContainerStateSchema = z.enum(['open', 'sealed', 'moved', 'unpacked']);

export const ContainerSchema = z.object({
  id: z.string(),
  label: z.string(),
  code: z.string().nullable(),
  state: ContainerStateSchema,
  originLocationId: z.string().nullable(),
  destinationLocationId: z.string().nullable(),
  currentLocationId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateContainerBody = z.object({
  label: z.string().min(1, 'Label is required'),
  code: z.string().nullable().optional(),
  originLocationId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const UpdateContainerBody = z.object({
  label: z.string().min(1, 'Label cannot be empty').optional(),
  code: z.string().nullable().optional(),
  originLocationId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const MoveContainerBody = z.object({
  destinationLocationId: z.string().min(1, 'Destination location is required'),
});

const ContainerMutation = z.object({ data: ContainerSchema, message: z.string() });

export const inventoryContainersContract = c.router({
  list: {
    method: 'GET',
    path: '/containers',
    query: z.object({ state: ContainerStateSchema.optional() }),
    responses: { 200: z.object({ data: z.array(ContainerSchema), total: z.number() }) },
    summary: 'List all containers, optionally filtered by state',
  },
  get: {
    method: 'GET',
    path: '/containers/:id',
    pathParams: z.object({ id: z.string() }),
    responses: { 200: z.object({ data: ContainerSchema }), ...ERR_RESPONSES },
    summary: 'Get a single container',
  },
  items: {
    method: 'GET',
    path: '/containers/:id/items',
    pathParams: z.object({ id: z.string() }),
    query: z.object({
      limit: z.coerce.number().positive().optional(),
      offset: z.coerce.number().nonnegative().optional(),
    }),
    responses: {
      200: z.object({ data: z.array(InventoryItemSchema), pagination: PaginationMetaSchema }),
      ...ERR_RESPONSES,
    },
    summary: "A container's contents",
  },
  create: {
    method: 'POST',
    path: '/containers',
    body: CreateContainerBody,
    responses: { 201: ContainerMutation, ...ERR_RESPONSES },
    summary: 'Create a container',
  },
  update: {
    method: 'PATCH',
    path: '/containers/:id',
    pathParams: z.object({ id: z.string() }),
    body: UpdateContainerBody,
    responses: { 200: ContainerMutation, ...ERR_RESPONSES },
    summary: 'Update a container (label, code, notes, origin location)',
  },
  seal: {
    method: 'POST',
    path: '/containers/:id/seal',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: ContainerMutation, ...ERR_RESPONSES },
    summary: 'Mark a container sealed',
  },
  move: {
    method: 'POST',
    path: '/containers/:id/move',
    pathParams: z.object({ id: z.string() }),
    body: MoveContainerBody,
    responses: { 200: ContainerMutation, ...ERR_RESPONSES },
    summary: 'Move a container to a new location; every item inside moves with it',
  },
  unpack: {
    method: 'POST',
    path: '/containers/:id/unpack',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: ContainerMutation, ...ERR_RESPONSES },
    summary: 'Mark a container unpacked',
  },
  delete: {
    method: 'DELETE',
    path: '/containers/:id',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a container; items inside are emptied, never deleted',
  },
});
