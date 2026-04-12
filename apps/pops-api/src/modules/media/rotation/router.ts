/**
 * Rotation tRPC router — endpoints for the library rotation system.
 *
 * PRD-070
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../../../trpc.js';
import { cancelLeaving } from './leaving-lifecycle.js';

export const rotationRouter = router({
  /** Cancel leaving status for a specific movie. */
  cancelLeaving: protectedProcedure
    .input(z.object({ movieId: z.number().int().positive() }))
    .mutation(({ input }) => {
      const updated = cancelLeaving(input.movieId);
      return {
        success: updated,
        message: updated ? 'Leaving status cancelled' : 'Movie not found or not leaving',
      };
    }),
});
