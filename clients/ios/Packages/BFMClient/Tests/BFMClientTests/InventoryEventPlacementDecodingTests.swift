import AppCore
import HTTPTypes
import Testing

@testable import BFMClient

/// POPS-4111: a move event's `before`/`after` decode `placement` and
/// `previousPlacement` into AppCore's own placement types, on both routes
/// that carry history (`changes` and `itemHistory`) — the two never share a
/// Swift type (ADR-033), so both are exercised rather than one standing in
/// for the other.
@Suite("BFMInventoryTransport move event decoding")
internal struct InventoryEventPlacementDecodingTests {
    @Test("changes decodes a move's placement pair as AppCore's placement types")
    func changesDecodesMovePlacement() async throws {
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: InventoryWire.changes(
                    events: [
                        InventoryWire.moveEvent(
                            beforePlacement: InventoryWire.placement(kind: "hand"),
                            afterPlacement: InventoryWire.placement(
                                kind: "location", id: "loc-42")
                        )
                    ])
            )
        ).fetchChanges(since: 0, epoch: "epoch-1", limit: 50)

        let event = try #require(page.events.first)
        #expect(event.kind == .moved)
        #expect(event.fields == ["placement", "previousPlacement"])
        #expect(event.before["placement"] == .placement(.hand))
        #expect(event.after["placement"] == .placement(.location("loc-42")))
    }

    @Test("changes decodes a move's previousPlacement as a container reference")
    func changesDecodesPreviousPlacement() async throws {
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: InventoryWire.changes(
                    events: [
                        InventoryWire.moveEvent(
                            beforePlacement: InventoryWire.placement(
                                kind: "container", id: "item-box"),
                            beforePreviousPlacement: "null",
                            afterPlacement: InventoryWire.placement(kind: "hand"),
                            afterPreviousPlacement: InventoryWire.placement(
                                kind: "container", id: "item-box")
                        )
                    ])
            )
        ).fetchChanges(since: 0, epoch: "epoch-1", limit: 50)

        let event = try #require(page.events.first)
        #expect(event.before["placement"] == .placement(.container("item-box")))
        #expect(event.after["previousPlacement"] == .previousPlacement(.container("item-box")))
    }

    @Test("itemHistory decodes the identical move shape on its own nominal type")
    func itemHistoryDecodesMovePlacement() async throws {
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: """
                    {"events":[\(InventoryWire.moveEvent(
                        afterPlacement: InventoryWire.placement(kind: "location", id: "loc-7")
                    ))],"nextCursor":null}
                    """
            )
        ).fetchItemEvents(itemId: "item-1", cursor: nil, limit: 50)

        let event = try #require(page.events.first)
        #expect(event.after["placement"] == .placement(.location("loc-7")))
    }

    @Test("an unrecognised event kind, actor kind and lifecycle string decode, never fail")
    func unrecognisedVocabulary() async throws {
        let json = """
            {"seq":1,"entityKind":"item","entityId":"item-1","kind":"a_future_kind",\
            "fields":[],"before":{},"after":{},"reason":null,\
            "actor":{"kind":"a_future_actor","label":"Someone"},\
            "clientTime":null,"serverTime":"2026-09-01T00:00:00.000Z",\
            "compensatesSeq":null,"undoable":false}
            """
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(status: .ok, json: InventoryWire.changes(events: [json]))
        ).fetchChanges(since: 0, epoch: "epoch-1", limit: 50)

        let event = try #require(page.events.first)
        #expect(event.kind == .unrecognised("a_future_kind"))
        #expect(event.actor == .unrecognised(kind: "a_future_actor", label: "Someone"))
    }

    @Test("an item's own lifecycle string this build has never heard of survives intact")
    func unrecognisedItemLifecycle() async throws {
        let page = try await BFMInventoryTransport.stubbed(
            StubTransport(
                status: .ok,
                json: InventoryWire.snapshot(
                    items: [InventoryWire.item(lifecycle: "quarantined")])
            )
        ).fetchSnapshot(cursor: nil, limit: 50)

        let item = try #require(page.items.first)
        #expect(item.lifecycle == .unrecognised("quarantined"))
    }
}
