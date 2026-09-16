import SwiftUI

/// Unpacking: a container's destination and contents, staged under a given
/// style so the structure and selection experiments can each hold the other
/// at its default (same pattern as ``InventoryRetrievalStaging``).
internal enum InventoryUnpackingStaging {
    @MainActor
    internal static func surface(
        style: InventoryUnpackingStyle,
        opening: String = "workspace"
    ) -> DesignSurface {
        let all = states(for: style)
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "unpacking"),
            title: "Unpacking",
            synopsis: "A container's destination and contents, on move day.",
            chrome: .navigationLarge,
            states: ordered
        )
    }

    @MainActor
    private static func states(for style: InventoryUnpackingStyle) -> [DesignState] {
        switch style.structure {
        case .namedWorkspace: workspaceStates(style: style)
        case .ordinaryContainerActions: ordinaryActionStates
        }
    }

    @MainActor
    private static func workspaceStates(style: InventoryUnpackingStyle) -> [DesignState] {
        [
            DesignState("workspace", "Just opened") {
                InventoryUnpackingWorkspaceView(state: InventoryUnpackingFixtures.justOpened)
                    .environment(\.inventoryUnpackingStyle, style)
            },
            DesignState("nearly-done", "Nearly done, one destination created") {
                InventoryUnpackingWorkspaceView(state: InventoryUnpackingFixtures.nearlyDone)
                    .environment(\.inventoryUnpackingStyle, style)
            },
            DesignState("empty-outcome", "Emptied: store or retire") {
                InventoryEmptyContainerOutcomeSheet(containerName: "Moving crate 3") { _ in }
            },
        ]
    }

    /// The alternative the structure experiment compares against: no
    /// dedicated screen, only the container's own action sheet, opened once
    /// per item picked up.
    @MainActor
    private static var ordinaryActionStates: [DesignState] {
        [
            DesignState("workspace", "The container's own actions") {
                InventoryActionList(item: InventoryFoundationFixtures.espresso)
            }
        ]
    }
}

internal enum InventoryUnpackingSurfaces {
    @MainActor internal static let unpacking = InventoryUnpackingStaging.surface(
        style: InventoryUnpackingStyle())

    @MainActor internal static let surfaces: [DesignSurface] = [unpacking]
}
