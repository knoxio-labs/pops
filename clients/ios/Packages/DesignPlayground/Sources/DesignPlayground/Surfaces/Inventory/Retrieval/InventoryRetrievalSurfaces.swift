import SwiftUI

/// Retrieval: the full in-hand list, and the moments around picking up and
/// putting back that the dashboard's compact section has no room to show.
///
/// Every state name matches a state POPS-3987 lists as required. "Many"
/// carries most of them at once, the same choice ``InventoryFoundationGallery``
/// makes: a stale placement, a deleted one, a closed source container, a
/// queued move, a conflict and an unsupported partial quantity are all real
/// rows a reviewer should see beside ordinary ones, not one apiece behind a
/// switch.
internal enum InventoryRetrievalStaging {
    @MainActor
    internal static func surface(
        style: InventoryRetrievalStyle,
        opening: String = "many"
    ) -> DesignSurface {
        let all = states(for: style)
        let ordered = all.filter { $0.id == opening } + all.filter { $0.id != opening }
        return DesignSurface(
            id: SurfaceID(area: "inventory", slug: "in-hand"),
            title: "In hand",
            synopsis: "Everything picked up and not yet put anywhere.",
            chrome: .navigationLarge,
            states: ordered
        )
    }

    @MainActor
    private static func states(for style: InventoryRetrievalStyle) -> [DesignState] {
        listStates(for: style) + cardStates(for: style)
    }

    @MainActor
    private static func listStates(for style: InventoryRetrievalStyle) -> [DesignState] {
        [
            DesignState("empty", "No in-hand items") {
                InventoryInHandListView(items: InventoryRetrievalFixtures.none)
                    .environment(\.inventoryRetrievalStyle, style)
            },
            DesignState("one", "One in hand") {
                InventoryInHandListView(items: InventoryRetrievalFixtures.one)
                    .environment(\.inventoryRetrievalStyle, style)
            },
            DesignState("many", "Several, including every recovery case") {
                InventoryInHandListView(items: InventoryRetrievalFixtures.many)
                    .environment(\.inventoryRetrievalStyle, style)
            },
        ]
    }

    /// The single-card states: moments the full list has no room to show in
    /// context, staged on their own.
    @MainActor
    private static func cardStates(for style: InventoryRetrievalStyle) -> [DesignState] {
        [
            DesignState("previous-placement", "Previous-placement card") {
                InventoryPreviousPlacementCard(
                    retrieval: InventoryRetrievalFixtures.staleRouter, onPutBack: {})
            },
            DesignState("pick-up-confirmation", "Pick-up confirmation") {
                InventoryPickUpConfirmationCard(
                    item: InventoryFoundationFixtures.television, onConfirm: {}, onCancel: {}
                )
                .environment(\.inventoryRetrievalStyle, style)
            },
            DesignState("put-back-success", "Put-back success") {
                InventoryPutBackSuccessCard(
                    item: InventoryFoundationFixtures.passport, destination: "Documents drawer",
                    reopenedContainer: false)
            },
            DesignState("destination-newly-created", "A newly created destination") {
                InventoryDestinationPickerSheet(
                    itemName: "Passport",
                    recent: [
                        InventoryDestination(
                            id: "hall-shelf", name: "Hall shelf", kind: .newLocation)
                    ],
                    containers: [],
                    locations: [InventoryDestination(id: "study", name: "Study", kind: .location)],
                    onChoose: { _ in }
                )
            },
            DesignState("undo", "Undo a move") {
                InventoryMovementUndoDemo()
            },
        ]
    }
}

internal enum InventoryRetrievalSurfaces {
    @MainActor internal static let inHand = InventoryRetrievalStaging.surface(
        style: InventoryRetrievalStyle())

    @MainActor internal static let surfaces: [DesignSurface] = [inHand]
}
