import AppCore
import Foundation

@testable import FeatureInventory

/// Items with every field the list screens read, for the search, Items and
/// In hand suites.
internal enum InventoryListFixture {
    static let now = Date(timeIntervalSinceReferenceDate: 800_000_000)
    static let day: TimeInterval = 24 * 60 * 60

    static let catalogue = InventoryCatalogue(
        version: "v1", units: [],
        types: [
            InventoryType(
                key: "tool", name: "Tool", capabilities: [], fields: [], legacyLabels: []),
            InventoryType(
                key: "storage_box", name: "Storage box", capabilities: [.containment],
                fields: [], legacyLabels: []),
        ])

    static func item(
        _ id: String, _ name: String, at placement: InventoryPlacement = .location("garage"),
        type: String? = "tool", code: String? = nil, quantity: Int = 1,
        lifecycle: InventoryLifecycle = .active, access: InventoryAccess? = nil,
        previous: InventoryPreviousPlacement? = nil, photo: String? = nil,
        addedDaysAgo: Double = 30, deleted: Bool = false
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: name, typeKey: type, code: code,
            quantity: InventoryQuantity(count: quantity), lifecycle: lifecycle,
            placement: placement, previousPlacement: previous,
            containment: access.map { InventoryContainment(access: $0, isFull: false) },
            photos: photo.map { [InventoryPhotoReference(sha256: $0, caption: nil)] } ?? [],
            createdAt: now.addingTimeInterval(-addedDaysAgo * day), updatedAt: now,
            deletedAt: deleted ? now : nil)
    }

    static func location(
        _ id: String, _ name: String, parent: String? = nil, order: Int = 0,
        deleted: Bool = false
    ) -> InventoryLocation {
        InventoryLocation(
            id: id, revision: 1, seq: 1, name: name, parentId: parent, sortOrder: order,
            deletedAt: deleted ? now : nil)
    }

    static func record(
        _ id: String, type: String? = "tool", code: String? = nil, quantity: Int = 1,
        lifecycle: InventoryLifecycle = .active, access: InventoryAccess? = nil,
        placement: InventoryRecord.Placement = .location, sync: InventorySync = .synchronized,
        photo: String? = nil
    ) -> InventoryRecord {
        InventoryRecord(
            id: id, name: id, typeKey: type, typeName: type, code: code,
            quantity: InventoryQuantity(count: quantity), lifecycle: lifecycle, access: access,
            placement: placement, path: [], sync: sync, photo: photo, createdAt: now)
    }
}

/// Waits for `condition` to hold, within a bounded number of scheduler turns,
/// so a store that never answers fails the test instead of hanging it.
@MainActor
internal func eventually(_ condition: () -> Bool) async -> Bool {
    for _ in 0..<1_000 {
        if condition() { return true }
        await Task.yield()
    }
    return condition()
}
