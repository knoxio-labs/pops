import AppCore
import HTTPTypes
import Testing

@testable import BFMClient

@Suite("BFMInventoryTransport snapshot and catalogue mapping")
internal struct InventorySnapshotMappingTests {
    @Test("a snapshot page carries its items, locations and high-water seq")
    func snapshotPage() async throws {
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: InventoryWire.snapshot(
                    items: [InventoryWire.item(id: "item-1", name: "Lamp")],
                    locations: [InventoryWire.location(id: "loc-1", name: "House")],
                    nextCursor: "\"cursor-2\""
                )
            )
        ).fetchSnapshot(cursor: nil, limit: 250)

        #expect(page.highWaterSeq == 10)
        #expect(page.items.map(\.id) == ["item-1"])
        #expect(page.items.first?.name == "Lamp")
        #expect(page.locations.map(\.id) == ["loc-1"])
        #expect(page.nextCursor == "cursor-2")
    }

    @Test("an item carries its migrated legacy type on both the snapshot and the feed")
    func legacyType() async throws {
        let items = [
            InventoryWire.item(id: "drill", legacyType: "Tools"),
            InventoryWire.item(id: "mug"),
        ]
        let snapshot = try await BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: InventoryWire.snapshot(items: items))
        ).fetchSnapshot(cursor: nil, limit: 250)
        let feed = try await BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: InventoryWire.changes(items: items))
        ).fetchChanges(since: 10, epoch: "epoch-1", limit: 250)

        #expect(snapshot.items.map(\.legacyType) == ["Tools", nil])
        #expect(feed.items.map(\.legacyType) == ["Tools", nil])
    }

    @Test("a container item carries its access and fullness; a non-container carries neither")
    func containment() async throws {
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: InventoryWire.snapshot(
                    items: [
                        InventoryWire.item(
                            id: "box-1", isContainer: true, access: "closed", isFull: "true"),
                        InventoryWire.item(id: "item-1", isContainer: false),
                    ])
            )
        ).fetchSnapshot(cursor: nil, limit: 250)

        let box = try #require(page.items.first { $0.id == "box-1" })
        let item = try #require(page.items.first { $0.id == "item-1" })
        #expect(box.containment == InventoryContainment(access: .closed, isFull: true))
        #expect(item.containment == nil)
    }

    @Test("a custom field decodes structurally: a bare string, a flag, a measurement and a range")
    func customFields() async throws {
        let fields = """
            {"note-field":"free text","is-broken":true,\
            "weight":{"value":1.5,"unit":"kg"},\
            "range-field":{"low":1,"high":2,"unit":"kg"}}
            """
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: InventoryWire.snapshot(items: [InventoryWire.item(fields: fields)]))
        ).fetchSnapshot(cursor: nil, limit: 250)

        let item = try #require(page.items.first)
        #expect(item.fields["note-field"] == .text("free text"))
        #expect(item.fields["is-broken"] == .flag(true))
        #expect(item.fields["weight"] == .measurement(InventoryMeasurement(value: 1.5, unit: "kg")))
        #expect(item.fields["range-field"] == .range(InventoryRange(low: 1, high: 2, unit: "kg")))
    }

    @Test("the catalogue maps every field kind and an unrecognised one is a contract mismatch")
    func catalogueFieldKinds() async throws {
        let field = { (kind: String) in
            "{\"key\":\"k\",\"label\":\"K\",\"kind\":\"\(kind)\"}"
        }
        let type = """
            {"key":"bulb","name":"Bulb","capabilities":[],"fields":[\(field("measurement"))],\
            "legacyLabels":[]}
            """
        let catalogue = try await BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: InventoryWire.catalogue(types: [type]))
        ).fetchCatalogue(knownVersion: nil)

        #expect(catalogue?.type(forKey: "bulb")?.fields.first?.kind == .measurement)

        let futureType = """
            {"key":"bulb","name":"Bulb","capabilities":[],"fields":[\(field("holographic"))],\
            "legacyLabels":[]}
            """
        await #expect(throws: RepositoryError.contractMismatch) {
            _ = try await BFMInventoryTransport.stubbed(
                StubTransport(status: .ok, json: InventoryWire.catalogue(types: [futureType]))
            ).fetchCatalogue(knownVersion: nil)
        }
    }
}
