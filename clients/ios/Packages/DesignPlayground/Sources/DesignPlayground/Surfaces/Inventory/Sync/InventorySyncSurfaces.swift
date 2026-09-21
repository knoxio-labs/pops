import SwiftUI

/// POPS-3988's surfaces: Sync and repair, one repair, the three
/// interruptions, and the approved screens offline.
@MainActor
internal enum InventorySyncSurfaces {
    internal static let syncID = SurfaceID(area: "inventory", slug: "sync")
    internal static let repairID = SurfaceID(area: "inventory", slug: "repair")
    internal static let interruptionsID = SurfaceID(area: "inventory", slug: "interruptions")
    internal static let offlineID = SurfaceID(area: "inventory", slug: "offline")

    private typealias Fixtures = InventorySyncFixtures

    internal static let sync = DesignSurface(
        id: syncID,
        title: "Sync",
        synopsis: "Counts, then needs attention with each fix, waiting to sync, and resolved.",
        chrome: .navigation,
        states: [
            syncState(
                "needs-attention", "Three need attention", .online(lastSynced: "4 min ago"),
                InventorySyncLedger(repairs: Fixtures.repairs, resolved: Fixtures.resolved)),
            syncState(
                "all-synced", "All synced", .online(lastSynced: "2 min ago"),
                InventorySyncLedger(resolved: Fixtures.resolved)),
            syncState(
                "waiting", "Offline, six waiting", .offline(lastSynced: "1 h ago"),
                InventorySyncLedger(waiting: Fixtures.waiting, resolved: Fixtures.resolved)),
            syncState(
                "syncing", "Syncing", .syncing,
                InventorySyncLedger(waiting: Fixtures.sending, resolved: Fixtures.resolved)),
            syncState(
                "resolved-open", "Resolved, open", .online(lastSynced: "2 min ago"),
                InventorySyncLedger(resolved: Fixtures.resolved), showsResolved: true),
            DesignState("loading", "Loading") { InventorySyncView(phase: .loading) },
            DesignState("first-launch", "First launch") { InventorySyncView(phase: .firstLaunch) },
        ]
    )

    internal static let repair = DesignSurface(
        id: repairID,
        title: "Repair",
        synopsis: "One repair: the item, what happened, the stacked choice, Keep and Undo.",
        chrome: .navigation,
        states: [
            repairState("conflict-placement", "Placement changed twice", Fixtures.placement),
            repairState("conflict-field", "Name changed twice", Fixtures.name),
            repairState("code-collision", "Code already used", Fixtures.code),
            repairState("deleted-elsewhere", "Deleted on iPad", Fixtures.deleted),
            repairState("photo-failed", "Photo not uploaded", Fixtures.photo),
            repairState("kept", "Kept, with Undo", Fixtures.placement, resolved: true),
        ]
    )

    internal static let interruptions = DesignSurface(
        id: interruptionsID,
        title: "Interruptions",
        synopsis: "Only what stops every change interrupts: a blocking sheet or an alert.",
        chrome: .bare,
        states: [
            interruptionState("session-expired", "Session expired", .sessionExpired),
            interruptionState("storage-full", "Storage full", .storageFull),
            interruptionState("app-too-old", "App too old", .appTooOld),
        ]
    )

    internal static let offline = DesignSurface(
        id: offlineID,
        title: "Offline",
        synopsis: "The app's banner over the approved screens; rows keep their own marks.",
        chrome: .bare,
        states: offlineStates
    )

    /// The offline surface opening on `state`, for an experiment whose answer
    /// is shown there.
    internal static func offlineSurface(opening state: String) -> DesignSurface {
        DesignSurface(
            id: offlineID, title: offline.title, synopsis: offline.synopsis, chrome: .bare,
            states: offlineStates.filter { $0.id == state }
                + offlineStates.filter { $0.id != state })
    }

    internal static let surfaces: [DesignSurface] = [sync, repair, interruptions, offline]

    private static var offlineStates: [DesignState] {
        [
            DesignState("dashboard", "Dashboard") {
                InventoryOfflineStage { InventoryShellView(fixture: InventoryFixtures.packing) }
            },
            DesignState("items", "Items, with waiting marks") {
                InventoryOfflineStage { NavigationStack { InventoryItemsBrowserView() } }
            },
            DesignState("search", "Search, with stale marks") {
                InventoryOfflineStage {
                    InventoryShellView(
                        fixture: InventoryFixtures.packing,
                        search: .offline(
                            query: "ca", staleIDs: InventorySearchFixtures.offlineStale))
                }
            },
        ]
    }

    private static func syncState(
        _ id: String, _ title: String, _ connection: InventorySyncConnection,
        _ ledger: InventorySyncLedger, showsResolved: Bool = false
    ) -> DesignState {
        DesignState(id, title) {
            InventorySyncView(connection: connection, ledger: ledger, showsResolved: showsResolved)
        }
    }

    private static func repairState(
        _ id: String, _ title: String, _ repair: InventoryRepair, resolved: Bool = false
    ) -> DesignState {
        DesignState(id, title) {
            InventoryRepairView(repair: repair, resolved: resolved).inventoryDestinations(true)
        }
    }

    private static func interruptionState(
        _ id: String, _ title: String, _ interruption: InventorySyncInterruption
    ) -> DesignState {
        DesignState(id, title) { InventorySyncInterruptionStage(interruption: interruption) }
    }
}
