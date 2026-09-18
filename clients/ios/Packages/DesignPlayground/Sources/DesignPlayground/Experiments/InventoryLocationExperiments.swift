/// The four questions POPS-3985 raised, all settled on the device. Only the
/// winning variants stay: a losing screen kept alive is a second answer
/// somebody will build from.
internal enum InventoryLocationExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        navigation, disclosure, picker, placementVisual,
    ]

    private static let decidedOn = "Decided by Joao, 2026-09-17: "

    @MainActor private static let navigation = DesignExperiment(
        id: "inventory-location-navigation",
        question: "Should the phone open on the tree, or on search?",
        subject: InventoryLocationSurfaces.browserID,
        status: .decided(
            variant: "tree-first",
            rationale: decidedOn
                + "the browser opens on the top-level places, with a search bar above them."),
        variants: [
            DesignVariant(
                id: "tree-first", title: "Tree with search above",
                note: "Counts, the search bar, then the top-level places.",
                surface: InventoryLocationSurfaces.browser)
        ]
    )

    @MainActor private static let disclosure = DesignExperiment(
        id: "inventory-location-disclosure",
        question: "Does going deeper disclose inline, or drill down to a new screen?",
        subject: InventoryLocationSurfaces.browserID,
        status: .decided(
            variant: "drill-down",
            rationale: decidedOn + "tapping a place pushes its own page. No inline outline."),
        variants: [
            DesignVariant(
                id: "drill-down", title: "Drill-down",
                note: "Each place opens its own page.",
                surface: InventoryLocationSurfaces.browser)
        ]
    )

    @MainActor private static let picker = DesignExperiment(
        id: "inventory-location-picker",
        question: "One universal picker, or a task-specific compact destination picker?",
        subject: InventoryLocationSurfaces.pickerID,
        status: .decided(
            variant: "universal",
            rationale: decidedOn
                + "one shared picker everywhere: recents, open containers, then the places, "
                + "with a new place made inline."),
        variants: [
            DesignVariant(
                id: "universal", title: "One shared picker",
                note: "Move, put back, create and store all open it.",
                surface: InventoryLocationSurfaces.picker)
        ]
    )

    @MainActor private static let placementVisual = DesignExperiment(
        id: "inventory-location-placement-visual",
        question:
            "How should direct and effective placement differ visually on a location's detail?",
        subject: InventoryLocationSurfaces.pageID,
        status: .decided(
            variant: "separate-section",
            rationale: decidedOn
                + "Directly here and Inside containers here are separate sections. Effective "
                + "placement is never shown as direct."),
        variants: [
            DesignVariant(
                id: "separate-section", title: "Separate sections",
                note: "Inside containers here is grouped by container.",
                surface: InventoryLocationSurfaces.page)
        ]
    )
}
