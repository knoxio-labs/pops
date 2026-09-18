import SwiftUI

/// POPS-3989's surfaces: Item detail through every lifecycle state and the
/// More menu's actions, and an item's History page.
@MainActor
internal enum InventoryLifecycleSurfaces {
    internal static let lifecycleID = SurfaceID(area: "inventory", slug: "lifecycle")
    internal static let historyID = SurfaceID(area: "inventory", slug: "history")

    private typealias Detail = InventoryItemDetailFixtures
    private typealias Fixtures = InventoryLifecycleFixtures

    internal static let lifecycle = DesignSurface(
        id: lifecycleID,
        title: "Lifecycle",
        synopsis: "Item detail inactive, and the More menu's discard, lost, retire and destroy.",
        chrome: .navigation,
        states: [
            detail("discarded", "Discarded, with a reason", Detail.discarded),
            detail("lost", "Lost", Detail.lost),
            detail("retired", "Retired", Fixtures.retired),
            detail("destroyed", "Destroyed", Detail.destroyed),
            detail(
                "restored", "Restored, with Undo", Detail.discarded,
                stage: InventoryItemDetailStage(performing: .restore)),
            detail(
                "just-discarded", "Just discarded, with Undo", Fixtures.television,
                stage: InventoryItemDetailStage(performing: .discard(.donated))),
            detail(
                "destroy-confirm", "Destroy, confirming", Fixtures.television,
                stage: InventoryItemDetailStage(isConfirmingDestroy: true)),
            detail("grouped-menu", "A group of 10, open More", Fixtures.forks),
            detail(
                "split", "Split", Fixtures.forks,
                stage: InventoryItemDetailStage(sheet: .split)),
            detail(
                "change-quantity", "Change quantity", Fixtures.forks,
                stage: InventoryItemDetailStage(sheet: .changeQuantity)),
        ]
    )

    internal static let history = DesignSurface(
        id: historyID,
        title: "History",
        synopsis: "Every event on one item, by month, filtered by kind; a line opens its account.",
        chrome: .navigation,
        states: [
            DesignState("long", "Long history") {
                InventoryItemHistoryView(name: "Espresso machine", entries: Fixtures.longHistory)
            },
            DesignState("short", "Short history") {
                InventoryItemHistoryView(name: "Television", entries: Fixtures.shortHistory)
            },
            DesignState("event-detail", "One event, in full") {
                InventoryItemHistoryView(
                    name: "Espresso machine", entries: Fixtures.longHistory,
                    viewing: Fixtures.longHistory.first)
            },
            DesignState("loading", "Loading") {
                InventoryItemHistoryView(name: "Espresso machine", entries: [], isLoading: true)
            },
        ]
    )

    internal static let surfaces: [DesignSurface] = [lifecycle, history]

    private static func detail(
        _ id: String, _ title: String, _ detail: InventoryItemDetail,
        stage: InventoryItemDetailStage = InventoryItemDetailStage()
    ) -> DesignState {
        DesignState(id, title) { InventoryItemDetailView(detail: detail, stage: stage) }
    }
}
