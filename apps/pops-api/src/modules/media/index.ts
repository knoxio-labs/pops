/**
 * Media domain — movies, tv shows, watchlist, watch history.
 */
import { router } from "../../trpc.js";
import { moviesRouter } from "./movies/router.js";

export const mediaRouter = router({
  movies: moviesRouter,
});
