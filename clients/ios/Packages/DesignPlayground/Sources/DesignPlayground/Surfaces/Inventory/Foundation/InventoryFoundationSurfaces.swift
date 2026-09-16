import SwiftUI

/// The surface POPS-3979's experiments are about, staged under a given style.
///
/// Every experiment variant builds its surface through here with one knob
/// turned, so the only difference between two variants of one question is
/// that knob — and the defaults they share are the ones written down in
/// ``InventoryFoundationStyle``.
internal enum InventoryFoundationStaging {
    @MainActor
    internal static func surface(
        style: InventoryFoundationStyle,
        synopsis: String? = nil
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "foundations"),
            title: "Foundations",
            synopsis: synopsis,
            chrome: .navigationLarge,
            states: [
                DesignState("default", "Catalogue") {
                    InventoryFoundationGallery().environment(\.inventoryStyle, style)
                },
                DesignState("container-actions", "An open container's actions") {
                    InventoryActionList(item: InventoryFoundationFixtures.kitchenBox)
                        .environment(\.inventoryStyle, style)
                },
                DesignState("item-actions", "An item's actions") {
                    InventoryActionList(item: InventoryFoundationFixtures.screws)
                        .environment(\.inventoryStyle, style)
                },
            ]
        )
    }
}

internal enum InventoryFoundationSurfaces {
    @MainActor internal static let foundations = InventoryFoundationStaging.surface(
        style: InventoryFoundationStyle(),
        synopsis:
            "Every Inventory row, badge and action in one place, at the defaults five open experiments "
            + "are still deciding."
    )

    @MainActor internal static let surfaces: [DesignSurface] = [foundations]
}
