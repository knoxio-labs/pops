/// Stages the three POPS-3985 surfaces under a given style, the way
/// ``InventoryFoundationStaging`` stages POPS-3979's. `opening` names the
/// state a reviewer lands on, and each experiment's variants pick the one
/// that answers their question.
internal enum InventoryLocationStaging {
    @MainActor internal static func browserSurface(
        style: InventoryLocationStyle, opening: String = "default"
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "location-browser"),
            title: "Locations",
            synopsis: "Top-level places down to a drawer, POPS-3985.",
            chrome: .navigationLarge,
            states: ordered(browserStates(style: style), opening: opening))
    }

    @MainActor internal static func detailSurface(
        style: InventoryLocationStyle, opening: String = "default"
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "location-detail"),
            title: "Location detail",
            synopsis: "What a location holds, directly and through everything below it.",
            chrome: .navigationLarge,
            states: ordered(detailStates(style: style), opening: opening))
    }

    @MainActor internal static func pickerSurface(
        style: InventoryLocationStyle, opening: String = "default"
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "location-picker"),
            title: "Choose a location",
            synopsis: "Choosing a destination while moving or unpacking.",
            chrome: .sheet,
            states: ordered(pickerStates(style: style), opening: opening))
    }

    private static func ordered(_ states: [DesignState], opening: String) -> [DesignState] {
        states.filter { $0.id == opening } + states.filter { $0.id != opening }
    }

    @MainActor private static func browserStates(style: InventoryLocationStyle) -> [DesignState] {
        [
            DesignState("default", "Small tree") {
                InventoryLocationBrowserView(tree: InventoryLocationFixtures.small, style: style)
            },
            DesignState("empty", "No locations") {
                InventoryLocationBrowserView(tree: InventoryLocationFixtures.empty, style: style)
            },
            DesignState("one-root", "One root") {
                InventoryLocationBrowserView(tree: InventoryLocationFixtures.oneRoot, style: style)
            },
            DesignState("deep", "Deep hierarchy") {
                InventoryLocationBrowserView(tree: InventoryLocationFixtures.deep, style: style)
            },
            DesignState("long-names", "Long names") {
                InventoryLocationBrowserView(
                    tree: InventoryLocationFixtures.longNames, style: style)
            },
            DesignState("hundreds", "Hundreds of nodes") {
                InventoryLocationBrowserView(tree: InventoryLocationFixtures.hundreds, style: style)
            },
            DesignState("stale", "Stale, offline tree") {
                InventoryLocationBrowserView(
                    tree: InventoryLocationFixtures.small, style: style, notice: .stale)
            },
            DesignState("loading", "Loading") { InventoryStateNotice(kind: .loading) },
        ]
    }

    @MainActor private static func detailStates(style: InventoryLocationStyle) -> [DesignState] {
        [
            DesignState("default", "Direct and effective") {
                InventoryLocationDetailView(
                    tree: InventoryLocationFixtures.small, locationID: "garage", style: style)
            },
            DesignState("non-empty-delete", "Deleting a non-empty location") {
                InventoryLocationDetailView(
                    tree: InventoryLocationFixtures.small, locationID: "garage-tools", style: style)
            },
            DesignState("conflicting-reparent", "Reparent would create a cycle") {
                InventoryStateNotice(kind: .repair)
            },
            DesignState("unavailable-previous-placement", "Previous placement unavailable") {
                InventoryStateNotice(kind: .unavailable)
            },
            DesignState("loading", "Loading counts") { InventoryStateNotice(kind: .loading) },
            DesignState("failed-counts", "Counts failed to load") {
                InventoryStateNotice(kind: .partial)
            },
        ]
    }

    @MainActor private static func pickerStates(style: InventoryLocationStyle) -> [DesignState] {
        [
            DesignState("default", "Choosing a destination") {
                InventoryLocationPickerView(
                    tree: InventoryLocationFixtures.small, style: style,
                    itemName: "Espresso machine")
            },
            DesignState("queued-create", "Creating a destination while queued") {
                InventoryLocationPickerView(
                    tree: InventoryLocationFixtures.small, style: style,
                    itemName: "Espresso machine")
            },
            DesignState("empty-recents", "No recent or favourite destinations") {
                InventoryLocationPickerView(
                    tree: InventoryLocationFixtures.oneRoot, style: style,
                    itemName: "Espresso machine",
                    showsRecentsAndFavorites: false)
            },
        ]
    }
}

internal enum InventoryLocationSurfaces {
    @MainActor internal static let browser = InventoryLocationStaging.browserSurface(
        style: InventoryLocationStyle())
    @MainActor internal static let detail = InventoryLocationStaging.detailSurface(
        style: InventoryLocationStyle())
    @MainActor internal static let picker = InventoryLocationStaging.pickerSurface(
        style: InventoryLocationStyle())

    @MainActor internal static let surfaces: [DesignSurface] = [browser, detail, picker]
}
