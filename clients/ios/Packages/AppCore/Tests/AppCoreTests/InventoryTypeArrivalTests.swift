import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("Type arrival")
internal struct InventoryTypeArrivalTests {
    private static let box = InventoryType(
        key: "storage_box", name: "Storage box", capabilities: [.containment], fields: [],
        legacyLabels: ["Box", "Storage box"])
    private static let bag = InventoryType(
        key: "bag", name: "Bag", capabilities: [], fields: [], legacyLabels: ["Bag", "Tote"])
    private static let before = InventoryCatalogue(version: "v1", units: [], types: [box])
    private static let after = InventoryCatalogue(version: "v2", units: [], types: [box, bag])

    private static func item(
        _ id: String, legacy: String?, typeKey: String? = nil,
        lifecycle: InventoryLifecycle = .active, deleted: Bool = false
    ) -> InventoryItem {
        InventoryItem(
            id: id, revision: 1, seq: 1, name: id, typeKey: typeKey, legacyType: legacy,
            lifecycle: lifecycle, placement: .hand, createdAt: .now, updatedAt: .now,
            deletedAt: deleted ? .now : nil)
    }

    private static func arrival(in store: InMemoryInventoryStore) async throws
        -> InventoryTypeArrival?
    {
        var iterator = store.observe(.typeArrival).makeAsyncIterator()
        return try #require(await iterator.next())
    }

    @Test("a catalogue change names only the types it adds, in the new catalogue's order")
    func addedKeys() {
        let wider = InventoryCatalogue(
            version: "v3", units: [],
            types: [
                InventoryType(key: "cable", name: "Cable", capabilities: [], fields: []),
                Self.box, Self.bag,
            ])
        #expect(
            InventoryTypeArrival.addedTypeKeys(from: Self.before, to: wider) == ["cable", "bag"])
    }

    @Test("the first catalogue announces nothing, and neither does the same version again")
    func firstCatalogueAndSameVersionAddNothing() {
        #expect(InventoryTypeArrival.addedTypeKeys(from: nil, to: Self.after).isEmpty)
        let sameVersion = InventoryCatalogue(version: "v1", units: [], types: [Self.box, Self.bag])
        #expect(InventoryTypeArrival.addedTypeKeys(from: Self.before, to: sameVersion).isEmpty)
    }

    @Test(
        "an item is covered only through a legacy label, ignoring case and spaces",
        arguments: [
            ("Tote", true), ("  tote ", true), ("BAG", true), ("Bags", false), ("Handbag", false),
            ("", false),
        ])
    func coveredOnlyByALabel(legacy: String, covered: Bool) {
        #expect(InventoryTypeArrival.covers(Self.bag, Self.item("x", legacy: legacy)) == covered)
    }

    @Test("the type's name alone never matches when no label names it")
    func nameIsNotALabel() {
        let unlabelled = InventoryType(
            key: "bag", name: "Bag", capabilities: [], fields: [], legacyLabels: [])
        #expect(!InventoryTypeArrival.covers(unlabelled, Self.item("x", legacy: "Bag")))
    }

    @Test("an item that already has a type is never covered, whatever its legacy text")
    func typedItemsAreNotCovered() {
        #expect(
            !InventoryTypeArrival.covers(Self.bag, Self.item("x", legacy: "Bag", typeKey: "box")))
    }

    @Test("a stored catalogue announces nothing before any change")
    func noArrivalWithoutAChange() async throws {
        let store = InMemoryInventoryStore(
            items: [Self.item("canvas", legacy: "Bag")], catalogue: Self.after)
        #expect(try await Self.arrival(in: store) == nil)
    }

    @Test("an added type offers its covered active items, by name, and nothing else")
    func offersCoveredItems() async throws {
        let store = InMemoryInventoryStore(
            items: [
                Self.item("tripod", legacy: "tote"), Self.item("canvas", legacy: "Bag"),
                Self.item("crate", legacy: "Box"), Self.item("loose", legacy: nil),
                Self.item("sold", legacy: "Bag", lifecycle: .retired),
                Self.item("gone", legacy: "Bag", deleted: true),
                Self.item("typed", legacy: "Bag", typeKey: "storage_box"),
            ],
            catalogue: Self.before)

        store.receiveCatalogue(Self.after)

        let found = try await Self.arrival(in: store)
        let arrival = try #require(found)
        #expect(arrival.type.key == "bag")
        #expect(arrival.items.map(\.id) == ["canvas", "tripod"])
    }

    @Test("an added type covering nothing asks nothing")
    func nothingCoveredAsksNothing() async throws {
        let store = InMemoryInventoryStore(
            items: [Self.item("crate", legacy: "Box")], catalogue: Self.before)
        store.receiveCatalogue(Self.after)
        #expect(try await Self.arrival(in: store) == nil)
    }

    @Test("a type with a required field is never offered")
    func requiredFieldTypesAreSkipped() async throws {
        let strict = InventoryType(
            key: "bag", name: "Bag", capabilities: [],
            fields: [
                InventoryFieldDefinition(key: "size", label: "Size", kind: .text, required: true)
            ],
            legacyLabels: ["Bag"])
        let store = InMemoryInventoryStore(
            items: [Self.item("canvas", legacy: "Bag")], catalogue: Self.before)
        store.receiveCatalogue(
            InventoryCatalogue(version: "v2", units: [], types: [Self.box, strict]))
        #expect(try await Self.arrival(in: store) == nil)
    }

    @Test("once settled, an arrival is never asked again, even if the type is re-added")
    func settledNeverReturns() async throws {
        let store = InMemoryInventoryStore(
            items: [Self.item("canvas", legacy: "Bag")], catalogue: Self.before)
        store.receiveCatalogue(Self.after)
        #expect(try await Self.arrival(in: store) != nil)

        try await store.settleTypeArrival(typeKey: "bag")
        #expect(try await Self.arrival(in: store) == nil)

        store.receiveCatalogue(InventoryCatalogue(version: "v3", units: [], types: [Self.box]))
        store.receiveCatalogue(
            InventoryCatalogue(version: "v4", units: [], types: [Self.box, Self.bag]))
        #expect(try await Self.arrival(in: store) == nil)
    }

    @Test("two arrivals are asked oldest first, the second once the first is settled")
    func arrivalsQueue() async throws {
        let tray = InventoryType(
            key: "tray", name: "Tray", capabilities: [], fields: [], legacyLabels: ["Tray"])
        let store = InMemoryInventoryStore(
            items: [Self.item("canvas", legacy: "Bag"), Self.item("desk", legacy: "Tray")],
            catalogue: Self.before)
        store.receiveCatalogue(Self.after)
        store.receiveCatalogue(
            InventoryCatalogue(version: "v3", units: [], types: [Self.box, Self.bag, tray]))

        #expect(try await Self.arrival(in: store)?.type.key == "bag")
        try await store.settleTypeArrival(typeKey: "bag")
        #expect(try await Self.arrival(in: store)?.type.key == "tray")
    }

    @Test("retyping an item keeps its legacy text, and it is no longer covered")
    func retypingKeepsTheLegacyText() async throws {
        let store = InMemoryInventoryStore(
            items: [Self.item("canvas", legacy: "Bag")], catalogue: Self.before)
        store.receiveCatalogue(Self.after)

        _ = try await store.perform(.changeItemType(id: "canvas", typeKey: "bag", fields: [:]))

        var iterator = store.observe(.item(id: "canvas")).makeAsyncIterator()
        let read = try #require(await iterator.next())
        let canvas = try #require(read)
        #expect(canvas.legacyType == "Bag")
        #expect(canvas.typeKey == "bag")
        #expect(try await Self.arrival(in: store) == nil)
    }
}
