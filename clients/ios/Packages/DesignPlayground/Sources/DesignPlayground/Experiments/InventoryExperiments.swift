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
                    "Decided by Joao on the device, 2026-09-16: grounded. It keeps the compact decided "
                    + "hierarchy, uses opaque grouped surfaces for inventory state, reserves yellow for "
                    + "open containers, and makes Browse distinct glass actions. Native iOS 27 swipe "
                    + "interactions handle closing containers, placing in-hand items, and undoing recent work."
            ),
            variants: [
                DesignVariant(
                    id: "grounded",
                    title: "Grounded",
                    note:
                        "Lived in's compact rhythm and browse grid, using opaque grouped content. "
                        + "Yellow marks only open work; glass identifies the Browse destinations.",
                    surface: groundedSurface)
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
                    "Decided by Joao on the device, 2026-09-15: composed. Open containers come first in "
                    + "thin yellow-highlighted rows, Browse next, and items in hand after that, while "
                    + "search and scan remain global glass controls at the bottom. The grounded "
                    + "dashboard is that order, finished."
            ),
            variants: [
                DesignVariant(
                    id: "composed",
                    title: "Composed",
                    note:
                        "Open containers lead, Browse follows, then items in hand; search and scan stay "
                        + "global in the iOS 27 glass controls at the bottom.",
                    surface: groundedSurface)
            ]
        ),
    ]

    @MainActor private static var groundedSurface: DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "root"),
            title: "Inventory",
            chrome: .navigationAndTabs,
            states: [
                DesignState.standard {
                    InventoryGroundedDashboardView(fixture: InventoryFixtures.packing)
                }
            ]
        )
    }
}
