import SwiftUI

/// The eleven conditions every variant is drawn in.
///
/// One list, used by the surface and by all four variants, so a variant cannot
/// quietly answer an easier set of questions than its neighbour. The order is
/// editorial: the objects a template suits come first, the ones it does not
/// come next, then the two moments where data is entered, then the two where
/// it has to pay off.
internal struct InventoryStagedStep: Identifiable {
    internal let id: String
    internal let title: String
    internal let step: InventoryPropertyStep
}

internal enum InventoryPropertyStaging {
    @MainActor internal static let steps: [InventoryStagedStep] = [
        InventoryStagedStep(
            id: "default", title: "Cable", step: .detail(InventoryPropertyFixtures.cable)),
        InventoryStagedStep(
            id: "bulb", title: "Light bulb", step: .detail(InventoryPropertyFixtures.bulb)),
        InventoryStagedStep(
            id: "tape", title: "Tape", step: .detail(InventoryPropertyFixtures.tape)),
        InventoryStagedStep(
            id: "box", title: "Storage box", step: .detail(InventoryPropertyFixtures.box)),
        InventoryStagedStep(
            id: "furniture", title: "Furniture, almost no data",
            step: .detail(InventoryPropertyFixtures.sideboard)),
        InventoryStagedStep(
            id: "uncategorised", title: "Uncategorised, legacy key",
            step: .detail(InventoryPropertyFixtures.adapter)),
        InventoryStagedStep(
            id: "create", title: "Creating, inference available",
            step: .create(InventoryPropertyFixtures.arriving, inferring: true)),
        InventoryStagedStep(
            id: "create-offline", title: "Creating, inference unavailable",
            step: .create(InventoryPropertyFixtures.arriving, inferring: false)),
        InventoryStagedStep(
            id: "edit", title: "Editing: duplicate key, unknown unit",
            step: .edit(InventoryPropertyFixtures.editing)),
        InventoryStagedStep(
            id: "search", title: "Searching by property",
            step: .search(InventoryPropertyFixtures.all, InventoryPropertyFixtures.query)),
        InventoryStagedStep(
            id: "compare", title: "Comparing two cables",
            step: .compare(InventoryPropertyFixtures.cables)),
    ]

    /// A surface staging one presentation across every step.
    ///
    /// Takes the presentation as a closure rather than an enum so that adding
    /// a fifth variant is a file and a catalogue line, with nothing to update
    /// here.
    @MainActor
    internal static func surface<Presentation: View>(
        synopsis: String? = nil,
        @ViewBuilder presentation: @escaping (InventoryPropertyStep) -> Presentation
    ) -> DesignSurface {
        DesignSurface(
            id: SurfaceID(area: "inventory", slug: "item"),
            title: "Item",
            synopsis: synopsis,
            chrome: .navigation,
            states: steps.map { staged in
                DesignState(staged.id, staged.title) { presentation(staged.step) }
            }
        )
    }
}

internal enum InventoryPropertySurfaces {
    /// The item screen as it stands while `inventory-item-properties` is open.
    ///
    /// It draws the hybrid variant, which is a placeholder and is named as one
    /// in the synopsis: a surface has to draw something, and drawing the
    /// narrowest option would have made the open question look settled in the
    /// other direction. The experiment decides what this becomes.
    @MainActor internal static let item = InventoryPropertyStaging.surface(
        synopsis:
            "How an item says what it can do. Provisional until inventory-item-properties is decided."
    ) { step in
        InventoryHybridVariantView(step: step)
    }

    @MainActor internal static let surfaces: [DesignSurface] = [item]
}
