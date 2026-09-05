import AppCore
import DesignSystem
import FeaturePurchases
import SwiftUI

/// The purchase history, staged through the exact view and view model the app
/// ships — see ``PlaygroundPurchasesRepository`` for how a state pins down
/// which of ``PurchasesListView``'s branches is on screen.
///
/// Chrome is ``Chrome/tabbed`` rather than ``Chrome/navigationAndTabs``:
/// `ContentView` hands `PurchasesListView` straight to a `TabView` with no
/// `NavigationStack` of its own — this feature is one screen, not a flow —
/// so a large title here would be reviewing a bar this surface never draws.
@MainActor
internal enum PurchasesSurfaces {
    static let surfaces: [DesignSurface] = [
        DesignSurface(
            id: SurfaceID(area: "purchases", slug: "list"),
            title: "Purchases",
            synopsis: "Purchase history, and the five ways a repository call can leave it undrawn.",
            chrome: .tabbed,
            states: [
                DesignState.standard {
                    PurchasesListView(
                        dependencies: playgroundPurchasesDependencies(rows: PurchasesFixtures.all))
                },
                DesignState("empty", "Empty") {
                    PurchasesListView(dependencies: playgroundPurchasesDependencies())
                },
                DesignState("loading", "Loading") {
                    PurchasesListView(dependencies: playgroundPurchasesDependencies(hangs: true))
                },
                DesignState("error-unavailable", "Pillar unavailable") {
                    PurchasesListView(
                        dependencies: playgroundPurchasesDependencies(failure: .unavailable))
                },
                DesignState("error-unauthorized", "Session ended") {
                    PurchasesListView(
                        dependencies: playgroundPurchasesDependencies(failure: .unauthorized))
                },
                DesignState("error-contract-mismatch", "Contract mismatch") {
                    PurchasesListView(
                        dependencies: playgroundPurchasesDependencies(failure: .contractMismatch))
                },
                DesignState("error-transport", "No connection") {
                    PurchasesListView(
                        dependencies: playgroundPurchasesDependencies(
                            failure: .transport("offline")))
                },
                DesignState("error-dependency-not-bound", "Not wired up") {
                    PurchasesListView(
                        dependencies: playgroundPurchasesDependencies(failure: .dependencyNotBound))
                },
            ]
        )
    ]
}
