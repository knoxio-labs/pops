import SwiftUI

/// The container-detail surface under a given style, staged the way
/// ``InventoryFoundationStaging`` stages the foundations surface: every
/// variant builds the whole surface with one knob turned, opening on the
/// state that answers its question.
internal enum InventoryContainerStaging {
    private static let profiles = InventoryContainerFixtures.all

    @MainActor
    internal static func detailSurface(
        style: InventoryContainerStyle,
        opening: String = InventoryContainerFixtures.partial.id,
        synopsis: String? = nil
    ) -> DesignSurface {
        let all = detailStates(style: style)
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "container-detail"),
            title: "Container detail",
            synopsis: synopsis,
            chrome: .navigation,
            states: ordered
        )
    }

    @MainActor
    internal static func openContainersSurface(
        style: InventoryContainerStyle,
        synopsis: String? = nil
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "open-containers"),
            title: "Open containers",
            synopsis: synopsis,
            chrome: .navigationLarge,
            states: [
                DesignState.standard {
                    InventoryOpenContainersView(profiles: profiles)
                        .environment(\.inventoryContainerStyle, style)
                }
            ]
        )
    }

    @MainActor
    private static func detailStates(style: InventoryContainerStyle) -> [DesignState] {
        profiles.map { profile in
            DesignState(profile.id, profile.item.name) {
                InventoryContainerDetailView(profile: profile)
                    .environment(\.inventoryContainerStyle, style)
            }
        }
    }
}

internal enum InventoryContainerSurfaces {
    private static let profiles = InventoryContainerFixtures.all
    private static let defaultStyle = InventoryContainerStyle()

    @MainActor internal static let browser = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "containers"),
        title: "Containers",
        synopsis: "Every container-capable item, sectioned by whether it can still be added to.",
        chrome: .navigationLarge,
        states: [
            DesignState.standard { InventoryContainerBrowserView(profiles: profiles) },
            DesignState("empty", "No containers yet") {
                InventoryContainerBrowserView(profiles: [])
            },
        ]
    )

    @MainActor internal static let openContainers =
        InventoryContainerStaging
        .openContainersSurface(
            style: defaultStyle,
            synopsis:
                "Every open container at once. inventory-open-containers-representation is still open."
        )

    @MainActor internal static let detail = InventoryContainerStaging.detailSurface(
        style: defaultStyle,
        synopsis:
            "A container's detail, as an item detail's extension. Structure, full and destination "
            + "are all still open; close-versus-seal is POPS-3979's."
    )

    @MainActor internal static let workspace = DesignSurface(
        id: SurfaceID(area: "inventory", slug: "container-workspace"),
        title: "Container workspace",
        synopsis: "The screen repeated physical work happens on: pack, unpack, check what's short.",
        chrome: .navigation,
        states: [
            InventoryContainerFixtures.partial, InventoryContainerFixtures.empty,
            InventoryContainerFixtures.full, InventoryContainerFixtures.closed,
            InventoryContainerFixtures.offline, InventoryContainerFixtures.needsAttention,
        ].map { profile in
            DesignState(profile.id, profile.item.name) {
                InventoryContainerWorkspaceView(profile: profile)
            }
        }
    )

    @MainActor internal static let surfaces: [DesignSurface] = [
        browser, openContainers, detail, workspace,
    ]
}
