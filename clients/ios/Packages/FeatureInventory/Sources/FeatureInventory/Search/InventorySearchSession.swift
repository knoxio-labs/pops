import AppCore
import Foundation
import Observation

/// Selection and write state shared by Inventory rows embedded in a search screen.
@MainActor @Observable
public final class InventorySearchSession {
    internal let writer: InventoryWriter
    internal let runner: InventoryCommandRunner
    internal var selection = InventorySelection()
    internal var moving: InventoryPlacementRequest?
    private let store: any InventoryStore

    /// Creates a search interaction session over the supplied Inventory store.
    public init(store: any InventoryStore) {
        self.store = store
        writer = InventoryWriter(store: store)
        runner = InventoryCommandRunner(store: store)
    }

    internal init(
        store: any InventoryStore,
        writer: InventoryWriter,
        runner: InventoryCommandRunner
    ) {
        self.store = store
        self.writer = writer
        self.runner = runner
    }

    internal func thumbnail(_ sha256: String) async -> Data? {
        try? await store.photo(sha256, variant: .thumb)
    }

    internal func settleMove(succeeded: Bool) {
        if succeeded { selection.deselectAll() }
    }
}
