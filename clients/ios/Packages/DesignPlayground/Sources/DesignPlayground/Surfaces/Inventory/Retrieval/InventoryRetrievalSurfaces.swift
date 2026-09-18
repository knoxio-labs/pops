import SwiftUI

/// In hand, opened from the dashboard's In hand header, in every state
/// POPS-3987 asks it to survive, and the item page a loose item is found on.
@MainActor
internal enum InventoryRetrievalSurfaces {
    private typealias Fixtures = InventoryRetrievalFixtures

    internal static let inHandID = SurfaceID(area: "inventory", slug: "in-hand")

    internal static let inHand = DesignSurface(
        id: inHandID,
        title: "In hand",
        synopsis: "Everything picked up and not put anywhere yet. Swipe to put back or move.",
        chrome: .navigationLarge,
        states: [
            DesignState("many", "Several in hand") { InventoryInHandView(items: Fixtures.many) },
            DesignState("selecting", "Two selected") {
                InventoryInHandView(
                    items: Fixtures.many, selected: [Fixtures.passport.id, Fixtures.screws.id])
            },
            DesignState("one", "One in hand") { InventoryInHandView(items: Fixtures.one) },
            DesignState("empty", "Nothing in hand") { InventoryInHandView(items: []) },
            DesignState("previous-gone", "Previous place deleted") {
                InventoryInHandView(items: Fixtures.previousGone)
            },
            DesignState("offline-queued", "Offline, changes queued") {
                InventoryInHandView(
                    items: Fixtures.queued, offline: "Offline. Changes wait on this phone.")
            },
            DesignState("put-back", "Just put back, with Undo") {
                InventoryInHandView(items: Fixtures.many, stage: .putBack(Fixtures.passport.id))
            },
            DesignState("move", "Moving, Put back at the top") {
                InventoryInHandView(items: Fixtures.many, stage: .move(Fixtures.router.id))
            },
            DesignState("found-put-back", "Found loose, put back from its page") {
                InventoryInHandItemPage(retrieval: Fixtures.passport, stagesPutBack: true)
            },
            DesignState("loading", "Loading") { InventoryInHandSkeleton() },
        ]
    )

    internal static let surfaces: [DesignSurface] = [inHand]
}
