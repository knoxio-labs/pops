import AppCore
import Foundation
import InventoryReplica
import Testing

@Suite("What the replica stores reads back unchanged")
internal struct ReplicaStorageTests {
    @Test("every item field survives the round trip")
    func fullItemRoundTrips() throws {
        let item = InventoryItem(
            id: "item-1", revision: 7, seq: 91, name: "Espresso machine", typeKey: "appliance",
            fields: [
                "colour": .choice("Red"), "notes": .text("Descale monthly"),
                "manual": .link("https://example.test"),
                "wifi": .flag(false),
                "weight": .measurement(InventoryMeasurement(value: 9.5, unit: "kg")),
                "temperature": .range(InventoryRange(low: 88, high: 96, unit: "celsius")),
            ],
            note: "Kitchen bench", code: "K-07",
            externalIds: [InventoryExternalIdentifier(kind: "serial", value: "X1")],
            quantity: InventoryQuantity(count: 2), lifecycle: .unrecognised("loaned"),
            lifecycleChangedAt: Fixture.created.addingTimeInterval(0.001),
            placement: .location("kitchen"),
            containment: InventoryContainment(access: .closed, isFull: true),
            photos: [
                InventoryPhotoReference(sha256: "aa", caption: nil),
                InventoryPhotoReference(sha256: "bb", caption: "Box"),
            ],
            provenance: InventoryProvenance(
                merchant: "Shop", price: MoneyAmount(minorUnits: 49_900, currencyCode: "AUD"),
                purchasedOn: Fixture.created, warrantyExpires: nil,
                transactionUri: "pops://purchases/order/1"),
            documentsStatus: .linked(["Manual.pdf"]), documentTitles: ["Manual.pdf"],
            createdAt: Fixture.created, updatedAt: Fixture.created.addingTimeInterval(1e-6))
        let replica = try Fixture.downloaded(items: [item])

        #expect(try replica.read(.item(id: "item-1")) == item)
    }

    @Test("a sparse item, a container in hand and each documents status survive the round trip")
    func sparseItemsRoundTrip() throws {
        let items = [
            InventoryItem(
                id: "a", revision: 1, seq: 1, name: "A", typeKey: nil, placement: .container("b"),
                documentsStatus: .unavailable, createdAt: Fixture.created,
                updatedAt: Fixture.created),
            InventoryItem(
                id: "b", revision: 1, seq: 1, name: "B", typeKey: nil, placement: .hand,
                previousPlacement: .tombstoned,
                containment: InventoryContainment(access: .open, isFull: false),
                createdAt: Fixture.created, updatedAt: Fixture.created),
        ]
        let replica = try Fixture.downloaded(items: items)

        #expect(try replica.read(.item(id: "a")) == items[0])
        #expect(try replica.read(.item(id: "b")) == items[1])
    }

    @Test("every event kind the wire names reads back as itself")
    func everyEventKindRoundTrips() throws {
        let wireKinds = [
            "created", "edited", "type_changed", "moved", "access_changed", "fullness_changed",
            "lifecycle_changed", "quantity_changed", "split", "code_changed", "photo_attached",
            "photo_removed", "photos_reordered", "deleted", "restored", "location_created",
            "location_renamed", "location_moved", "location_deleted", "reverted", "migrated",
            "a_kind_from_a_newer_server",
        ]
        let reasons = ["donated", "sold", "used_up", "broken", "gave_away", "lent_out"]
        let events = wireKinds.enumerated().map { index, wire in
            InventoryEvent(
                seq: index + 1, entityKind: .location, entityId: "hall",
                kind: InventoryEventKind(wire: wire),
                fields: [], before: [:], after: [:],
                reason: InventoryDiscardReason(wire: reasons[index % reasons.count]),
                actor: index.isMultiple(of: 2) ? .service(account: "purchases") : .migration,
                clientTime: Fixture.created, serverTime: Fixture.created, compensatesSeq: index,
                undoable: false)
        }
        let replica = try Fixture.downloaded()

        try replica.apply(Fixture.changes(events: events))

        #expect(try replica.read(.history(locationId: "hall")) == events.reversed())
        let unrecognised = events.dropLast().filter {
            if case .unrecognised = $0.kind { true } else { false }
        }
        #expect(unrecognised.isEmpty, "the list above names a kind AppCore does not know")
    }

    @Test("a stored catalogue reads back whole, and a newer announced version asks for a fetch")
    func catalogueRoundTrips() throws {
        let catalogue = InventoryCatalogue(
            version: "cat-1",
            units: [InventoryUnit(key: "kg", dimension: "mass", multiplierToBase: 1000)],
            types: [
                InventoryType(
                    key: "storage_box", name: "Storage box", capabilities: [.containment],
                    fields: [
                        InventoryFieldDefinition(
                            key: "size", label: "Size", kind: .choice, choices: ["S", "L"],
                            highlighted: true),
                        InventoryFieldDefinition(
                            key: "weight", label: "Weight", kind: .measurement, dimension: "mass",
                            defaultUnit: "kg", required: true),
                    ],
                    legacyLabels: ["Box"])
            ])
        let replica = try InventoryReplica()
        #expect(try replica.read(.catalogue) == InventoryReplica.emptyCatalogue)
        #expect(try !replica.syncPosition().needsCatalogue)

        try replica.apply(Fixture.snapshot())
        #expect(try replica.syncPosition().needsCatalogue)

        try replica.store(catalogue)
        #expect(try replica.read(.catalogue) == catalogue)
        #expect(try !replica.syncPosition().needsCatalogue)

        try replica.apply(
            InventoryChangesPage(
                epoch: Fixture.epoch, items: [], locations: [], events: [], nextSince: 11,
                hasMore: false,
                catalogueVersion: "cat-2"))
        #expect(try replica.syncPosition().needsCatalogue)
    }

    @Test("an observer sees the current value, then each committed write")
    func observeFollowsWrites() async throws {
        let replica = try Fixture.downloaded(items: [Fixture.item("a")])
        var updates = replica.observe(.inHand).makeAsyncIterator()

        #expect(try await updates.next()?.map(\.id) == ["a"])

        try replica.apply(Fixture.changes(items: [Fixture.item("b")]))
        #expect(try await updates.next()?.map(\.id) == ["a", "b"])
    }
}
