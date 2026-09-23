import AppCore
import Foundation
import Testing

@testable import InventoryReplica

/// What each vector's op leaves behind, read from the server's op
/// (`pillars/inventory/src/domain/commands/`), since the vector file records
/// only the outcome.
internal enum CommandVectorStates {
    typealias Check = @Sendable (InventoryReplica) throws -> Void

    static let lamp = "20000000-0000-4000-8000-000000000002"
    static let other = "20000000-0000-4000-8000-000000000003"
    static let crate = "20000000-0000-4000-8000-000000000001"
    static let house = "10000000-0000-4000-8000-000000000001"
    static let garage = "10000000-0000-4000-8000-000000000002"
    static let shelf = "10000000-0000-4000-8000-000000000003"
    static let hash = String(repeating: "a", count: 64)
    static let clock = (try? CommandVectorDecoding.date("2026-09-19T00:00:00.000Z")) ?? .distantPast

    static let checks: [String: Check] = itemChecks.merging(moreItemChecks) { $1 }
        .merging(locationChecks) { $1 }

    private static let itemChecks: [String: Check] = [
        "item.move-to-location": { replica throws in
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.placement == .location(house))
            #expect(item.previousPlacement == nil)
        },
        "item.setAccess-close": { replica throws in
            #expect(try replica.read(.item(id: crate))?.containment?.access == .closed)
        },
        "item.setFull-true": { replica throws in
            #expect(try replica.read(.item(id: crate))?.containment?.isFull == true)
        },
        "item.setLifecycle-discard": { replica throws in
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.lifecycle == .discarded)
            #expect(item.lifecycleChangedAt == clock)
            #expect(try replica.read(.inHand).isEmpty)
        },
        "item.restoreDeleted": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.deletedAt == nil)
        },
        "event.revert-move": { replica throws in
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.placement == .hand)
            #expect(item.revision == 3)
        },
        "item.create-untyped-in-hand": { replica throws in
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.name == "Lamp")
            #expect(item.placement == .hand)
            #expect(item.typeKey == nil)
            #expect(item.containment == nil)
            #expect(item.createdAt == clock)
        },
    ]

    private static let moreItemChecks: [String: Check] = [
        "item.edit-name": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.name == "Reading lamp")
        },
        "item.changeType-to-bulb": { replica throws in
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.typeKey == "bulb")
            #expect(item.fields == ["Fitting": .choice("E27")])
            #expect(item.containment == nil)
        },
        "item.setCode": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.code == "B412")
        },
        "item.setQuantity": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.quantity.count == 40)
        },
        "item.split": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.quantity.count == 30)
            let split = try #require(try replica.read(.item(id: other)))
            #expect(split.quantity.count == 10)
            #expect(split.name == "Screws")
            #expect(split.placement == .hand)
            #expect(split.code == nil)
            #expect(split.revision == 1)
        },
        "item.attachPhoto": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.photos.map(\.sha256) == [hash])
        },
        "item.removePhoto": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.photos.isEmpty == true)
        },
        "item.reorderPhotos": { replica throws in
            #expect(try replica.read(.item(id: lamp))?.photos.map(\.sha256) == [hash])
        },
        "item.delete-with-contents": { replica throws in
            #expect(try replica.read(.item(id: other)) == nil)
            let lampItem = try #require(try replica.read(.item(id: lamp)))
            #expect(lampItem.placement == .hand)
            #expect(lampItem.previousPlacement == .tombstoned)
            #expect(lampItem.revision == 2)
        },
        "item.setOverride": { replica throws in
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.revision == 2)
            #expect(
                item.fieldValues == [
                    InventoryItemFieldEntry(
                        fieldId: CommandVectorDecoding.computedFieldId,
                        state: .value([.boolean(false)]), source: .override,
                        catalogueRevision: 2)
                ])
        },
        "item.clearOverride": { replica throws in
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.revision == 3)
            #expect(item.fieldValues.isEmpty)
        },
    ]

    private static let locationChecks: [String: Check] = [
        "location.create-under-parent": { replica throws in
            let location = try #require(try replica.read(.location(id: garage)))
            #expect(location.parentId == house)
            #expect(location.sortOrder == 0)
            #expect(location.revision == 1)
        },
        "location.rename": { replica throws in
            #expect(try replica.read(.location(id: house))?.name == "The house")
        },
        "location.move": { replica throws in
            #expect(try replica.read(.location(id: garage))?.parentId == house)
        },
        "location.delete-root": { replica throws in
            #expect(try replica.read(.location(id: house)) == nil)
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.placement == .hand)
            #expect(item.previousPlacement == .tombstoned)
        },
        "location.delete-with-parent": { replica throws in
            #expect(try replica.read(.location(id: garage)) == nil)
            #expect(try replica.read(.location(id: shelf))?.parentId == house)
            let item = try #require(try replica.read(.item(id: lamp)))
            #expect(item.placement == .hand)
            #expect(item.previousPlacement == .tombstoned)
            #expect(try replica.read(.contents(ofLocation: house)).isEmpty)
        },
    ]
}
