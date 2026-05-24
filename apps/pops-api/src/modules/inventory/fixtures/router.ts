import { z } from 'zod';

import { paginationMeta, PaginationMetaSchema } from '../../../shared/pagination.js';
import { mapDomainErrors } from '../../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import {
  ConnectFixtureSchema,
  CreateFixtureSchema,
  FixtureConnectionQuerySchema,
  FixtureQuerySchema,
  FixtureSchema,
  ItemFixtureConnectionSchema,
  UpdateFixtureSchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

const FixtureMutationResponse = z.object({ data: FixtureSchema, message: z.string() });
const DeleteResponse = z.object({ message: z.string() });
const ConnectResponse = z.object({ data: ItemFixtureConnectionSchema, message: z.string() });

export const fixturesRouter = router({
  list: protectedProcedure
    .input(FixtureQuerySchema)
    .output(z.object({ data: z.array(FixtureSchema), total: z.number() }))
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;
      const { rows, total } = service.listFixtures({
        locationId: input.locationId,
        type: input.type,
        limit,
        offset,
      });
      return { data: rows, total };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(z.object({ data: FixtureSchema }))
    .query(({ input }) => mapDomainErrors(() => ({ data: service.getFixture(input.id) }))),

  create: protectedProcedure
    .input(CreateFixtureSchema)
    .output(FixtureMutationResponse)
    .mutation(({ input }) =>
      mapDomainErrors(() => ({
        data: service.createFixture(input),
        message: 'Fixture created',
      }))
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string().min(1), data: UpdateFixtureSchema }))
    .output(FixtureMutationResponse)
    .mutation(({ input }) =>
      mapDomainErrors(() => ({
        data: service.updateFixture(input.id, input.data),
        message: 'Fixture updated',
      }))
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .output(DeleteResponse)
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        service.deleteFixture(input.id);
        return { message: 'Fixture deleted' };
      })
    ),

  connect: protectedProcedure
    .input(ConnectFixtureSchema)
    .output(ConnectResponse)
    .mutation(({ input }) =>
      mapDomainErrors(() => ({
        data: service.connectItemToFixture(input.itemId, input.fixtureId),
        message: 'Item connected to fixture',
      }))
    ),

  disconnect: protectedProcedure
    .input(ConnectFixtureSchema)
    .output(DeleteResponse)
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        service.disconnectItemFromFixture(input.itemId, input.fixtureId);
        return { message: 'Item disconnected from fixture' };
      })
    ),

  listForItem: protectedProcedure
    .input(FixtureConnectionQuerySchema)
    .output(
      z.object({ data: z.array(ItemFixtureConnectionSchema), pagination: PaginationMetaSchema })
    )
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;
      const { rows, total } = service.listFixturesForItem(input.itemId, limit, offset);
      return {
        data: rows,
        pagination: paginationMeta(total, limit, offset),
      };
    }),
});
