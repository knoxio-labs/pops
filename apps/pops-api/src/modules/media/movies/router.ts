/**
 * Movie tRPC router — CRUD procedures for movies.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { paginationMeta } from "../../../shared/pagination.js";
import {
  CreateMovieSchema,
  UpdateMovieSchema,
  MovieQuerySchema,
  toMovie,
  type MovieFilters,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError } from "../../../shared/errors.js";

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const moviesRouter = router({
  /** List movies with optional filters and pagination. */
  list: protectedProcedure.input(MovieQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const filters: MovieFilters = {
      search: input.search,
      genre: input.genre,
    };

    const { rows, total } = service.listMovies(filters, limit, offset);

    return {
      data: rows.map(toMovie),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Get a single movie by ID. */
  get: protectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => {
    try {
      const row = service.getMovie(input.id);
      return { data: toMovie(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Create a new movie. */
  create: protectedProcedure.input(CreateMovieSchema).mutation(({ input }) => {
    const row = service.createMovie(input);
    return {
      data: toMovie(row),
      message: "Movie created",
    };
  }),

  /** Update an existing movie. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: UpdateMovieSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateMovie(input.id, input.data);
        return {
          data: toMovie(row),
          message: "Movie updated",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /** Delete a movie. */
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    try {
      service.deleteMovie(input.id);
      return { message: "Movie deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
