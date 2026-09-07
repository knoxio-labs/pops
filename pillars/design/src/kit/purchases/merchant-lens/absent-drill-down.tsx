/**
 * The layers below this one, named as absent.
 *
 * The merchant lens is specified as total → treemap by tag → line items →
 * per-item buy count, last bought, inventory presence. Only the first
 * exists. Saying so where the panels would have been is the cheap version of
 * the same discipline the residual gets — an empty treemap or a placeholder
 * chart would read as "nothing to show", a claim about the data rather than
 * about the software.
 */
export function AbsentDrillDown() {
  return (
    <section className="space-y-2 rounded-md border border-dashed p-4">
      <h2 className="text-sm font-semibold">Not built below this layer</h2>
      <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
        <li>Spend broken down by tag needs an aggregate over item tags (POPS-1851).</li>
        <li>
          Line items, per-item buy count and last bought need a product-grain aggregate (POPS-1849).
        </li>
        <li>Whether an item is already in inventory needs the inventory fan-out (POPS-245).</li>
      </ul>
    </section>
  );
}
