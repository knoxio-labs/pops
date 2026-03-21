/**
 * Inventory reports tRPC router — aggregate/summary queries.
 */
import { router, protectedProcedure } from "../../../trpc.js";
import * as service from "./service.js";

export const reportsRouter = router({
  /** Get dashboard summary (item count, total values, warranty alerts, recent items). */
  dashboard: protectedProcedure.query(() => {
    return { data: service.getDashboard() };
  }),
});
