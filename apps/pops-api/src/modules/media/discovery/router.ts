/**
 * Discovery tRPC router — preference profile and quick pick queries.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../../trpc.js";
import * as service from "./service.js";

export const discoveryRouter = router({
  /** Get computed preference profile (genre affinities, dimension weights, genre distribution). */
  profile: protectedProcedure.query(() => {
    return { data: service.getPreferenceProfile() };
  }),

  /** Get random unwatched movies for the quick pick flow. */
  quickPick: protectedProcedure
    .input(z.object({ count: z.number().int().positive().max(10).default(3) }))
    .query(({ input }) => {
      return { data: service.getQuickPickMovies(input.count) };
    }),
});
