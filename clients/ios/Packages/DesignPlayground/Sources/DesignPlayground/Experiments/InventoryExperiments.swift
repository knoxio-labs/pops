import SwiftUI

internal enum InventoryExperiments {
    @MainActor internal static let all: [DesignExperiment] = [
        DesignExperiment(
            id: "inventory-root-finish",
            question:
                "Should Inventory read as a useful dashboard or as a place with depth, rhythm, and identity?",
            subject: SurfaceID(area: "inventory", slug: "root"),
            status: .decided(
                variant: "grounded",
                rationale:
                    "Grounded, approved on the device 2026-09-16. It keeps the compact decided hierarchy, "
                    + "uses opaque grouped surfaces for inventory state, reserves yellow for open containers, "
                    + "and makes Browse distinct glass actions. Native iOS 27 swipe "
                    + "interactions handle closing containers, placing in-hand items, and undoing recent work."
            ),
            variants: [
                DesignVariant(
                    id: "functional",
                    title: "Functional",
                    note:
                        "The decided hierarchy in conventional cards: clear, direct, and deliberately plain.",
                    surface: finishSurface {
                        InventoryDashboardView(
                            fixture: InventoryFixtures.packing, layout: .composed)
                    }),
                DesignVariant(
                    id: "grounded",
                    title: "Grounded",
                    note:
                        "Lived in's compact rhythm and browse grid, using opaque grouped content. "
                        + "Yellow marks only open work; glass identifies the Browse destinations.",
                    surface: finishSurface {
                        InventoryGroundedDashboardView(fixture: InventoryFixtures.packing)
                    }),
                DesignVariant(
                    id: "lived-in",
                    title: "Lived in",
                    note:
                        "The same hierarchy and fixture, using Purchases' lessons: a tinted glass focal point, "
                        + "related rows sharing material, stronger figures, and a more varied rhythm.",
                    surface: finishSurface {
                        InventoryLivingDashboardView(fixture: InventoryFixtures.packing)
                    }),
            ]
        ),
        DesignExperiment(
            id: "inventory-root-priority",
            question:
                "What should the Inventory tab show first so it works during a move and after it?",
            subject: SurfaceID(area: "inventory", slug: "root"),
            status: .decided(
                variant: "composed",
                rationale:
                    "Composed, decided on the device 2026-09-15. The functional hierarchy works with open "
                    + "containers first in thin yellow-highlighted rows, Browse next, and items in hand after "
                    + "that, while search and scan remain global glass controls at the bottom. The visual "
                    + "execution remains deliberately undecided: the reviewer found this version too "
                    + "functional and asked for the beauty, quality, and life of the newer Purchases flow."
            ),
            variants: [
                variant(
                    id: "composed",
                    title: "Composed",
                    note:
                        "Open containers lead in thin warning cards, Browse follows, then items in hand; search "
                        + "and scan stay global in the iOS 27 glass controls at the bottom.",
                    layout: .composed),
                variant(
                    id: "search-first",
                    title: "Search first",
                    note:
                        "Finding and scanning are the command centre; open work follows them.",
                    layout: .searchFirst),
                variant(
                    id: "packing-first",
                    title: "Packing first",
                    note:
                        "Open containers and items in hand take the reachable top position while work is active.",
                    layout: .packingFirst),
                variant(
                    id: "place-first",
                    title: "Place first",
                    note:
                        "The home and its location hierarchy orient the screen before individual objects.",
                    layout: .placeFirst),
                variant(
                    id: "overview-first",
                    title: "Overview first",
                    note:
                        "Catalogue totals and recently touched items make the tab a long-term inventory overview.",
                    layout: .overview),
            ]
        ),
    ]

    @MainActor
    private static func finishSurface<Content: View>(
        @ViewBuilder content: @escaping () -> Content
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "root"),
            title: "Inventory",
            chrome: .navigationAndTabs,
            states: [DesignState.standard { content() }]
        )
    }

    @MainActor
    private static func variant(
        id: String,
        title: String,
        note: String,
        layout: InventoryDashboardLayout
    ) -> DesignVariant {
        DesignVariant(
            id: id,
            title: title,
            note: note,
            surface: DesignSurface(
                id: SurfaceID(area: "inventory", slug: "root"),
                title: "Inventory",
                chrome: .navigationAndTabs,
                states: [
                    DesignState.standard {
                        InventoryDashboardView(fixture: InventoryFixtures.packing, layout: layout)
                    }
                ]
            )
        )
    }
}
