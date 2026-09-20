import AppCore
import Observation

/// The open-containers page's state, over `InventoryStore`: every open
/// container in one query, the same set the dashboard's panel counts, and
/// Close.
@MainActor @Observable
internal final class InventoryOpenContainersModel {
    internal let runner: InventoryCommandRunner
    internal let containers: InventoryObservation<[InventoryContainerProfile]>

    internal init(store: any InventoryStore) {
        runner = InventoryCommandRunner(store: store)
        containers = InventoryObservation(store: store, query: Self.query)
    }

    /// Every active, undeleted container whose access is open.
    internal static var query: InventoryQuery<[InventoryContainerProfile]> {
        InventoryQuery { source in
            source.inventoryOpenContainers().map {
                InventoryContainerProfile(reading: source, container: $0)
            }
        }
    }

    /// Follows the replica until the calling task is cancelled.
    internal func observe() async {
        await containers.observe()
    }

    /// Closes a container and offers Undo. It leaves the page because the
    /// query stops matching it, not because this removes it.
    internal func close(_ container: InventoryContainerProfile) async {
        await runner.perform(
            [.setItemAccess(id: container.id, access: .closed)],
            announcing: "Closed \(container.name)", symbol: .close)
    }
}
