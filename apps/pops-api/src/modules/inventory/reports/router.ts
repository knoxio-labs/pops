/**
 * Inventory reports tRPC router — warranty tracking and dashboard summaries.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../../../trpc.js";
import { toInventoryItem } from "../items/types.js";
import * as service from "./service.js";

export const reportsRouter = router({
  /** List all items with warranty dates, sorted by expiry. */
  warranties: protectedProcedure.query(() => {
    const rows = service.listWarrantyItems();
    return { data: rows.map(toInventoryItem) };
  }),

  /** Get dashboard summary (item count, total values, warranty alerts, recent items). */
  dashboard: protectedProcedure.query(() => {
    return { data: service.getDashboard() };
  }),

  /** Get insurance report — items grouped by location with values and warranty status. */
  insuranceReport: protectedProcedure
    .input(z.object({ locationId: z.string().optional() }).optional())
    .query(({ input }) => {
      return { data: service.getInsuranceReport(input?.locationId) };
    }),
});
