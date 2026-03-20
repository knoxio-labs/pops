/**
 * Media domain router — aggregates media sub-routers.
 */
import { router } from "../../trpc.js";
import { comparisonsRouter } from "./comparisons/index.js";

export const mediaRouter = router({
  comparisons: comparisonsRouter,
});
