/// The four questions POPS-3985 opens, all left `.open` for Joao to decide on
/// the device. Each varies exactly one field of ``InventoryLocationStyle``
/// and holds the others at their defaults.
internal enum InventoryLocationExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        navigation, disclosure, picker, placementVisual,
    ]

    private static let browserSubject = SurfaceID(area: "inventory", slug: "location-browser")
    private static let detailSubject = SurfaceID(area: "inventory", slug: "location-detail")
    private static let pickerSubject = SurfaceID(area: "inventory", slug: "location-picker")

    @MainActor private static let navigation = DesignExperiment(
        id: "inventory-location-navigation",
        question: "Should the phone open on the tree, or on search?",
        subject: browserSubject,
        variants: [
            browserVariant(
                "tree-first", "Tree-first",
                note: "Opens on the hierarchy from the top; search is there but not the landing.",
                style: .init(navigation: .treeFirst)),
            browserVariant(
                "search-first", "Search-first",
                note:
                    "Opens on a flat, filterable list of every location; the hierarchy is reached "
                    + "by tapping into a result.",
                style: .init(navigation: .searchFirst)),
        ]
    )

    @MainActor private static let disclosure = DesignExperiment(
        id: "inventory-location-disclosure",
        question: "Does going deeper disclose inline, or drill down to a new screen?",
        subject: browserSubject,
        variants: [
            browserVariant(
                "inline", "Inline disclosure",
                note: "Expands in place. Holds the whole hierarchy on one screen; costs height at "
                    + "the hundreds-of-nodes state.",
                style: .init(disclosure: .inline)),
            browserVariant(
                "drill-down", "Drill-down",
                note: "Each location opens its own screen. Current default.",
                style: .init(disclosure: .drillDown)),
        ]
    )

    @MainActor private static let picker = DesignExperiment(
        id: "inventory-location-picker",
        question: "One universal picker, or a task-specific compact destination picker?",
        subject: pickerSubject,
        variants: [
            pickerVariant(
                "compact", "Compact",
                note: "Recent, favourite and open-container destinations only, until a search "
                    + "reaches for the rest. Current default.",
                style: .init(picker: .compact)),
            pickerVariant(
                "universal", "Universal",
                note: "The complete browsable hierarchy, every time a destination is needed.",
                style: .init(picker: .universal)),
        ]
    )

    @MainActor private static let placementVisual = DesignExperiment(
        id: "inventory-location-placement-visual",
        question:
            "How should direct and effective placement differ visually on a location's detail?",
        subject: detailSubject,
        variants: [
            detailVariant(
                "separate-section", "Separate sections",
                note: "Directly here, and through containers and sub-locations, as two sections. "
                    + "Current default.",
                style: .init(placementVisual: .separateSection)),
            detailVariant(
                "inline-marker", "One list, marked",
                note: "Direct and effective rows sit together; the effective-only ones carry a "
                    + "move glyph rather than their own section.",
                style: .init(placementVisual: .inlineMarker)),
            detailVariant(
                "toggle", "Behind a toggle",
                note: "Direct only, by default; effective placement is a link to a second screen.",
                style: .init(placementVisual: .toggle)),
        ]
    )

    @MainActor private static func browserVariant(
        _ id: String, _ title: String, note: String, style: InventoryLocationStyle
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryLocationStaging.browserSurface(style: style))
    }

    @MainActor private static func detailVariant(
        _ id: String, _ title: String, note: String, style: InventoryLocationStyle
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryLocationStaging.detailSurface(style: style))
    }

    @MainActor private static func pickerVariant(
        _ id: String, _ title: String, note: String, style: InventoryLocationStyle
    ) -> DesignVariant {
        DesignVariant(
            id: id, title: title, note: note,
            surface: InventoryLocationStaging.pickerSurface(style: style))
    }
}
