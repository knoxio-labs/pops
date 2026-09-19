import AppCore
import Foundation
import Observation

/// The containers browser's state, over `InventoryStore`: every container
/// read in one query, what the search bar narrows it to, and Close.
@MainActor @Observable
internal final class InventoryContainerBrowserModel {
    internal let runner: InventoryCommandRunner
    internal let containers: InventoryObservation<[InventoryContainerProfile]>
    internal var filter: InventoryContainerFilter = .all
    internal var query = ""

    internal init(store: any InventoryStore) {
        runner = InventoryCommandRunner(store: store)
        containers = InventoryObservation(store: store, query: Self.query)
    }

    /// Every container, newest change first.
    internal static var query: InventoryQuery<[InventoryContainerProfile]> {
        InventoryQuery { source in
            source.inventoryContainers()
                .sorted { $0.updatedAt > $1.updatedAt }
                .map { InventoryContainerProfile(reading: source, container: $0) }
        }
    }

    internal func filterMatched(_ all: [InventoryContainerProfile]) -> [InventoryContainerProfile] {
        all.filter(filter.matches)
    }

    internal func shown(_ all: [InventoryContainerProfile]) -> [InventoryContainerProfile] {
        InventoryContainerSearchMatching.matching(query, in: filterMatched(all))
    }

    /// Closes an open container; it leaves the open panel because the query
    /// stops matching it, not because this removes it.
    internal func close(_ container: InventoryContainerProfile) async {
        await runner.perform([.setItemAccess(id: container.id, access: .closed)])
    }
}
