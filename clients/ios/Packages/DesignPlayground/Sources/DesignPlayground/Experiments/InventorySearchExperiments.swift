/// The two open questions POPS-3982 asks visually, on top of the decided
/// foundation. Both restage ``InventorySearchSurfaces/search``, see
/// ``DesignExperiment`` for why several open experiments on one surface is
/// normal, and the query is the same across every variant, "a", chosen
/// because it matches at least one item, one container and one location in
/// the fixtures, so a reviewer sees all three kinds on every variant.
@MainActor
internal enum InventorySearchExperiments {
    internal static let all: [DesignExperiment] = [grouping, filterPresentation]

    private static let query = "a"

    private static let grouping = DesignExperiment(
        id: "inventory-search-grouping",
        question:
            "Do results read as sections by kind, or as one list ranked by relevance, and, if "
            + "grouped, does a container (an item, ADR-001) count once or twice?",
        subject: SurfaceID(area: "inventory", slug: "search"),
        status: .decided(
            variant: "ranked",
            rationale:
                "One ranked list, decided on the device 2026-09-16. The mark at the head of each row says what kind of thing it is, so grouping by kind would repeat what the glyph already says."
        ),
        variants: [
            DesignVariant(
                id: "by-kind",
                title: "Grouped, container once",
                note:
                    "Items, Containers and Locations under their own headers. A container appears "
                    + "once, in Containers.",
                surface: surface(groupingStyle: .byKind)),
            DesignVariant(
                id: "by-kind-duplicated",
                title: "Grouped, container twice",
                note:
                    "The same headers, but a container also appears in Items, because it is one.",
                surface: surface(groupingStyle: .byKindContainersDuplicated)),
            DesignVariant(
                id: "ranked",
                title: "One ranked list",
                note: "No headers. Kind is read off the row's own mark, not a section.",
                surface: surface(groupingStyle: .ranked)),
        ]
    )

    private static let filterPresentation = DesignExperiment(
        id: "inventory-search-filter-presentation",
        question:
            "When a filter is active, does it show as a removable chip above the results, or only "
            + "inside the sheet that set it?",
        subject: SurfaceID(area: "inventory", slug: "search"),
        status: .decided(
            variant: "sheet-only",
            rationale:
                "Sheet only, with the filter button in Inventory's colour while a filter is active, decided on the device 2026-09-16. A tinted button says something is on without spending a row of chips above every result list."
        ),
        variants: [
            DesignVariant(
                id: "chips",
                title: "Chips above results",
                note:
                    "Each active filter is its own capsule, removable without reopening the sheet.",
                surface: surface(showsFilterChips: true)),
            DesignVariant(
                id: "sheet-only",
                title: "Sheet only",
                note:
                    "Nothing above the list but the filter button itself, filled and in Inventory's "
                    + "colour to say something is on. Removing one means reopening the sheet.",
                surface: surface(showsFilterChips: false)),
        ]
    )

    private static func surface(
        groupingStyle: InventorySearchGroupingStyle = .byKind,
        showsFilterChips: Bool = true
    ) -> DesignSurface {
        let filters: Set<InventorySearchFilter> = [.directPlacement]
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "search"),
            title: "Search",
            chrome: .navigation,
            states: [
                DesignState.standard {
                    InventorySearchResults(
                        query: query, groupingStyle: groupingStyle, presetFilters: filters,
                        showsFilterChips: showsFilterChips)
                }
            ]
        )
    }
}
