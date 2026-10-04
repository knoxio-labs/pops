import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureInventory

@Suite("Item detail read from the store")
internal struct InventoryItemDetailReaderTests {
    private typealias Fixture = InventoryFixture

    private static let espresso = InventoryType(
        key: "espresso", name: "Brewing equipment", capabilities: [],
        fields: [
            InventoryFieldDefinition(key: "colour", label: "Colour", kind: .text),
            InventoryFieldDefinition(
                key: "power", label: "Boiler power", kind: .measurement, dimension: "power",
                defaultUnit: "W", highlighted: true),
            InventoryFieldDefinition(key: "brand", label: "Brand", kind: .text, highlighted: true),
            InventoryFieldDefinition(
                key: "model", label: "Model", kind: .text, highlighted: true),
        ])

    private static func item(
        typeKey: String?, fields: [String: InventoryFieldValue],
        placement: InventoryPlacement = .location("kitchen"),
        lifecycle: InventoryLifecycle = .active
    ) -> InventoryItem {
        InventoryItem(
            id: "machine", revision: 1, seq: 1, name: "Espresso machine", typeKey: typeKey,
            fields: fields, lifecycle: lifecycle, placement: placement,
            createdAt: Fixture.epoch, updatedAt: Fixture.epoch)
    }

    private static func read(
        _ item: InventoryItem, extra: [InventoryItem] = [], events: [InventoryEvent] = [],
        repairs: [InventoryRepair] = []
    ) async -> InventoryItemDetail? {
        let store = RecordingInventoryStore(
            InMemoryInventoryStore(
                items: [item] + extra,
                locations: [Fixture.location("kitchen", "Kitchen")],
                catalogue: InventoryCatalogue(version: "1", units: [], types: [espresso]),
                repairs: repairs),
            history: events)
        let epoch = Fixture.epoch
        for await detail in store.observe(InventoryItemDetail.query(id: item.id, now: { epoch })) {
            return detail
        }
        return nil
    }

    @Test("highlighted fields are the descriptor's, in its order, and only those with a value")
    func highlightedFromDescriptor() async throws {
        let detail = try #require(
            await Self.read(
                Self.item(
                    typeKey: "espresso",
                    fields: [
                        "brand": .text("Rancilio"), "colour": .text("Steel"),
                        "power": .measurement(InventoryMeasurement(value: 1400, unit: "W")),
                        "legacy": .text("kept"),
                    ])))

        #expect(detail.highlightedFields.map(\.label) == ["Boiler power", "Brand"])
        #expect(detail.otherFields.map(\.label) == ["Colour", "legacy"])
        #expect(detail.record.typeName == "Brewing equipment")
    }

    @Test("an item with no type, or a type the catalogue lacks, highlights nothing")
    func untypedHighlightsNothing() async throws {
        let fields: [String: InventoryFieldValue] = ["brand": .text("Rancilio")]
        let untyped = try #require(await Self.read(Self.item(typeKey: nil, fields: fields)))
        let unknown = try #require(await Self.read(Self.item(typeKey: "kettle", fields: fields)))

        #expect(untyped.highlightedFields.isEmpty)
        #expect(untyped.otherFields.map(\.value) == ["Rancilio"])
        #expect(unknown.highlightedFields.isEmpty)
        #expect(untyped.subtitle == "No type yet")
    }

    @Test("a measurement keeps the unit it was typed in, and a range reads low to high")
    func valuesKeepTheirUnits() {
        let posix = Locale(identifier: "en_US_POSIX")
        #expect(
            InventoryDetailFields.display(
                .measurement(InventoryMeasurement(value: 2.7, unit: "L")), locale: posix) == "2.7 L"
        )
        #expect(
            InventoryDetailFields.display(
                .measurement(InventoryMeasurement(value: 1400, unit: "W")), locale: posix)
                == "1400 W")
        #expect(
            InventoryDetailFields.display(
                .range(InventoryRange(low: 2, high: 5, unit: "kg")), locale: posix)
                == "2\u{2013}5 kg")
        #expect(InventoryDetailFields.display(.flag(false)) == "No")
    }

    @Test("the placement line walks containers outward to the room, and opens the holder")
    func trailWalksContainers() async throws {
        let crate = InventoryItem(
            id: "crate", revision: 1, seq: 1, name: "Moving crate 3", typeKey: nil,
            placement: .container("box"),
            containment: InventoryContainment(access: .open, isFull: false),
            createdAt: Fixture.epoch, updatedAt: Fixture.epoch)
        let box = Fixture.item("box", "Kitchen 12", at: .location("kitchen"), access: .closed)
        let detail = try #require(
            await Self.read(
                Self.item(typeKey: nil, fields: [:], placement: .container("crate")),
                extra: [crate, box]))

        #expect(detail.record.trail.crumbs == ["Kitchen", "Kitchen 12", "Moving crate 3"])
        #expect(detail.record.trail.collapsedCrumbs == ["Kitchen", "\u{2026}", "Moving crate 3"])
        #expect(detail.record.trail.holder == .container("crate"))
    }

    @Test("an inactive item's notice carries the reason from its latest lifecycle event")
    func lifecycleReasonFromEvent() async throws {
        let older = InventoryEvent(
            seq: 3, entityKind: .item, entityId: "machine", kind: .lifecycleChanged,
            fields: ["lifecycle"], before: [:], after: ["lifecycle": .text("discarded")],
            reason: .sold, actor: .web, clientTime: nil, serverTime: Fixture.epoch,
            compensatesSeq: nil, undoable: false)
        let latest = InventoryEvent(
            seq: 5, entityKind: .item, entityId: "machine", kind: .lifecycleChanged,
            fields: ["lifecycle"], before: [:], after: ["lifecycle": .text("discarded")],
            reason: .donated, actor: .device(id: "d1", label: "iPhone"), clientTime: nil,
            serverTime: Fixture.epoch, compensatesSeq: nil, undoable: true)
        let detail = try #require(
            await Self.read(
                Self.item(typeKey: nil, fields: [:], lifecycle: .discarded),
                events: [latest, older]))

        #expect(detail.lifecycleChange?.reason == .donated)
        #expect(detail.activity.map(\.seq) == [5, 3])
        #expect(detail.activity.first?.title == "Discarded · Donated")
        #expect(detail.activity.first?.device == "iPhone")
    }

    @Test("an open repair on the item becomes its conflict notice")
    func repairBecomesConflict() async throws {
        let repair = InventoryRepair(
            id: "m1", entityKind: .item, entityId: "machine", kind: .conflict,
            field: "placement",
            options: [
                InventoryRepairOption(value: "Office", source: .thisDevice, at: Fixture.epoch),
                InventoryRepairOption(
                    value: "Garage", source: .otherDevice(label: "iPad"), at: Fixture.epoch),
            ],
            openedAt: Fixture.epoch)
        let detail = try #require(
            await Self.read(Self.item(typeKey: nil, fields: [:]), repairs: [repair]))

        #expect(detail.conflict?.problem == "Moved on iPad too")
        #expect(detail.conflict?.resolution == "Keep this phone's placement")
        #expect(detail.record.sync == .needsAttention)
    }

    @Test("a move reads where it went and came from; to hand reads Picked up")
    func movesNamePlaces() async throws {
        let store = InMemoryInventoryStore(
            items: [Self.item(typeKey: nil, fields: [:])],
            locations: [
                Fixture.location("kitchen", "Kitchen"), Fixture.location("garage", "Garage"),
            ])
        let events = [
            InventoryEvent(
                seq: 2, entityKind: .item, entityId: "machine", kind: .moved,
                fields: ["placement"], before: ["placement": .link("kitchen")],
                after: ["placement": .link("garage")], reason: nil, actor: .web,
                clientTime: nil, serverTime: Fixture.epoch, compensatesSeq: nil, undoable: true),
            InventoryEvent(
                seq: 3, entityKind: .item, entityId: "machine", kind: .moved,
                fields: ["placement"], before: ["placement": .link("garage")],
                after: ["placement": .text("hand")], reason: nil, actor: .web,
                clientTime: nil, serverTime: Fixture.epoch, compensatesSeq: nil, undoable: true),
        ]
        let epoch = Fixture.epoch
        let query = InventoryQuery { source in
            InventoryActivityEntries(source: source, now: epoch, calendar: .current)
                .entries(for: events)
        }
        var lines: [InventoryActivityEntry] = []
        for await answer in store.observe(query) {
            lines = answer
            break
        }

        #expect(lines.map(\.title) == ["Picked up", "Moved to Garage"])
        #expect(lines.last?.from == "Kitchen")
        #expect(lines.first?.to == "In hand")
        #expect(lines.allSatisfy { $0.kind == .move })
    }

    @Test("a deleted item reads as absent")
    func deletedIsAbsent() async {
        let item = Fixture.item("machine", "Espresso machine", at: .hand, deleted: true)
        #expect(await Self.read(item) == nil)
    }
}

@Suite("Inventory history event copy")
internal struct InventoryHistoryEventCopyTests {
    private typealias Fixture = InventoryFixture

    @Test("history uses server placement, container, location and fullness event copy")
    func serverEventCopy() async {
        let now = Fixture.epoch
        let store = InMemoryInventoryStore(
            items: [
                Fixture.item("machine", "Espresso machine", at: .location("kitchen")),
                Fixture.item("box", "Toolbox", at: .location("kitchen"), access: .closed),
            ],
            locations: [Fixture.location("kitchen", "Kitchen")])
        let events = [
            Fixture.event(1, .putBack, on: "machine", after: ["placement": .link("kitchen")]),
            Fixture.event(2, .stored, on: "machine", after: ["placement": .link("box")]),
            Fixture.event(3, .sealed, on: "machine"),
            Fixture.event(4, .unpacked, on: "machine"),
            Fixture.event(5, .edited, on: "kitchen", entityKind: .location, fields: ["name"]),
            Fixture.event(
                6, .edited, on: "kitchen", entityKind: .location, fields: ["parentId"]),
            Fixture.event(
                7, .edited, on: "machine", fields: ["isFull"], after: ["isFull": .flag(false)]),
            Fixture.event(8, .opened, on: "machine"),
            Fixture.event(9, .closed, on: "machine"),
        ]
        let query = InventoryQuery { source in
            InventoryActivityEntries(source: source, now: now, calendar: .current)
                .entries(for: events)
        }
        var entries: [InventoryActivityEntry] = []
        for await answer in store.observe(query) {
            entries = answer
            break
        }

        #expect(entries.first { $0.seq == 1 }?.title == "Put back in Kitchen")
        #expect(entries.first { $0.seq == 2 }?.title == "Stored in Toolbox")
        #expect(entries.first { $0.seq == 3 }?.title == "Sealed")
        #expect(entries.first { $0.seq == 4 }?.title == "Unpacked")
        #expect(entries.first { $0.seq == 5 }?.title == "Renamed")
        #expect(entries.first { $0.seq == 6 }?.title == "Moved")
        #expect(entries.first { $0.seq == 7 }?.title == "No longer full")
        #expect(entries.first { $0.seq == 8 }?.title == "Opened")
        #expect(entries.first { $0.seq == 9 }?.title == "Closed")
    }
}
