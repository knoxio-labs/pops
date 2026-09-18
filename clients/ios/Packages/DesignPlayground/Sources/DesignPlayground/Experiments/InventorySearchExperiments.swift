/// The two questions POPS-3982 asked about search, both settled on the
/// device. Only the winning variants stay.
@MainActor
internal enum InventorySearchExperiments {
    internal static let all: [DesignExperiment] = [grouping, filterPresentation]

    private static let grouping = DesignExperiment(
        id: "inventory-search-grouping",
        question:
            "Do results read as sections by kind, or as one list ranked by relevance, and, if "
            + "grouped, does a container (an item, ADR-001) count once or twice?",
        subject: InventorySearchSurfaces.searchID,
        status: .decided(
            variant: "ranked",
            rationale:
                "One ranked list, decided on the device 2026-09-16. The mark at the head of each "
                + "row says what kind of thing it is, so grouping by kind would repeat what the "
                + "glyph already says."
        ),
        variants: [
            DesignVariant(
                id: "ranked",
                title: "One ranked list",
                note: "No headers. Kind is read off the row's own mark, not a section.",
                surface: InventorySearchSurfaces.search)
        ]
    )

    private static let filterPresentation = DesignExperiment(
        id: "inventory-search-filter-presentation",
        question:
            "When a filter is active, does it show as a removable chip above the results, or only "
            + "inside the sheet that set it?",
        subject: InventorySearchSurfaces.searchID,
        status: .decided(
            variant: "sheet-only",
            rationale:
                "Sheet only, with the filter circle filled in Inventory's colour while a filter is "
                + "active, decided on the device 2026-09-16. A filled circle says something is on "
                + "without spending a row of chips above every result list."
        ),
        variants: [
            DesignVariant(
                id: "sheet-only",
                title: "Sheet only",
                note:
                    "Nothing above the list but the filter circle itself, amber while a filter is on.",
                surface: InventorySearchSurfaces.search)
        ]
    )
}
