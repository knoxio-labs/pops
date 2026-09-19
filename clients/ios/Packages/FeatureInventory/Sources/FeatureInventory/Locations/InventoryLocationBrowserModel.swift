import AppCore
import Observation

/// The locations browser's state, over `InventoryStore`: the whole tree in
/// one query, the search text, and New place.
@MainActor @Observable
internal final class InventoryLocationBrowserModel {
    internal let runner: InventoryCommandRunner
    internal let tree: InventoryObservation<InventoryLocationTree>
    internal var query = ""
    internal var creating = false

    internal init(store: any InventoryStore) {
        runner = InventoryCommandRunner(store: store)
        tree = InventoryObservation(
            store: store, query: InventoryQuery { InventoryLocationTree(reading: $0) })
    }
}
