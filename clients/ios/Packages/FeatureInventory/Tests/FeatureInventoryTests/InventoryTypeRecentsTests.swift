import Foundation
import Testing

@testable import FeatureInventory

@Suite("Inventory item type recents")
internal struct InventoryTypeRecentsTests {
    @Test("recents are newest first, unique, capped and pruned")
    func orderingAndPruning() throws {
        let defaults = try #require(UserDefaults(suiteName: "inventory-type-recents-tests"))
        defaults.removePersistentDomain(forName: "inventory-type-recents-tests")
        defer { defaults.removePersistentDomain(forName: "inventory-type-recents-tests") }

        for id in (0..<8).map(String.init) { InventoryTypeRecents.record(id, in: defaults) }
        #expect(
            InventoryTypeRecents.load(from: defaults, validIDs: ["0", "2", "4", "6", "7"])
                == ["7", "6", "4", "2"])
        InventoryTypeRecents.record("4", in: defaults)
        #expect(
            InventoryTypeRecents.load(from: defaults, validIDs: Set(["4", "7"])) == ["4", "7"])
    }

    @Test("clearing recents removes the device-local list")
    func clearing() throws {
        let defaults = try #require(UserDefaults(suiteName: "inventory-type-recents-clear-tests"))
        defaults.removePersistentDomain(forName: "inventory-type-recents-clear-tests")
        defer { defaults.removePersistentDomain(forName: "inventory-type-recents-clear-tests") }

        InventoryTypeRecents.record("book", in: defaults)
        InventoryTypeRecents.removeAll(from: defaults)

        #expect(InventoryTypeRecents.load(from: defaults, validIDs: ["book"]).isEmpty)
    }
}
