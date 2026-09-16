import SwiftUI

/// The surface POPS-3979's experiments are about, staged under a given style.
///
/// Every experiment variant builds its surface through here with one knob
/// turned, so the only difference between two variants of one question is
/// that knob, and the defaults they share are the ones written down in
/// ``InventoryFoundationStyle``.
internal enum InventoryFoundationStaging {
    /// `opening` names the state a reviewer lands on. An experiment shows a
    /// variant's opening state and nothing else (see ``DesignExperiment``'s
    /// staging), so the question a variant answers has to be answered by its
    /// first state, and each experiment says which that is.
    @MainActor
    internal static func surface(
        style: InventoryFoundationStyle,
        opening: String = "default",
        synopsis: String? = nil
    ) -> DesignSurface {
        let all = states(for: style)
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "foundations"),
            title: "Foundations",
            synopsis: synopsis,
            chrome: .navigationLarge,
            states: ordered
        )
    }

    @MainActor
    private static func states(for style: InventoryFoundationStyle) -> [DesignState] {
        [
            DesignState("default", "Catalogue") {
                InventoryFoundationGallery().environment(\.inventoryStyle, style)
            },
            DesignState("container-actions", "A container's actions") {
                InventoryContainerActionsView().environment(\.inventoryStyle, style)
            },
            DesignState("item-actions", "An item's actions") {
                InventoryActionList(item: InventoryFoundationFixtures.screws)
                    .environment(\.inventoryStyle, style)
            },
        ]
    }
}

internal enum InventoryFoundationSurfaces {
    @MainActor internal static let foundations = InventoryFoundationStaging.surface(
        style: InventoryFoundationStyle(),
        synopsis:
            "Every Inventory row, badge and action in one place, as decided on 2026-09-16."
    )

    @MainActor internal static let surfaces: [DesignSurface] = [foundations]
}
