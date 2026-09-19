import AppCore
import OpenAPIRuntime
import Testing

@testable import BFMClient

/// Encodes an ``InventoryCommand`` into the op and args
/// `pillars/inventory/contracts/command-vectors-v1.json` records for the same
/// op, generated straight from the server's own command tests — so a
/// mismatch here means this build would send the server something its own
/// fixtures never exercised.
@Suite("BFMInventoryCommandEncoding")
internal struct InventoryCommandEncodingTests {
    @Test("item.move encodes the destination and verb the vector file records")
    func moveToLocation() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .moveItem(id: "item-1", to: .location("loc-1"), verb: .move)
        )

        #expect(envelope.op == "item.move")
        #expect(envelope.entityId == "item-1")
        #expect(envelope.args["verb"] as? String == "move")
        let to = try #require(envelope.args["to"] as? [String: (any Sendable)?])
        #expect(to["kind"] as? String == "location")
        #expect(to["locationId"] as? String == "loc-1")
    }

    @Test("a pick-up moves into the hand, matching the server's own pairing of the two")
    func pickUp() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .moveItem(id: "item-1", to: .hand, verb: .pickUp)
        )

        #expect(envelope.args["verb"] as? String == "pick_up")
        let to = try #require(envelope.args["to"] as? [String: (any Sendable)?])
        #expect(to["kind"] as? String == "hand")
    }

    @Test("editItem's note patch omits an unchanged key and sends an explicit null when cleared")
    func editNotePatch() throws {
        let unchanged = try BFMInventoryCommandEncoding.envelope(
            for: .editItem(id: "item-1", name: nil, note: .unchanged, fields: [:])
        )
        #expect(unchanged.args.keys.contains("note") == false)

        let cleared = try BFMInventoryCommandEncoding.envelope(
            for: .editItem(id: "item-1", name: nil, note: .cleared, fields: [:])
        )
        #expect(cleared.args.keys.contains("note"))
        #expect((cleared.args["note"] ?? "not present") == nil)
    }

    @Test("editItem sends externalIds only when the edit replaces the list")
    func editExternalIds() throws {
        let untouched = try BFMInventoryCommandEncoding.envelope(
            for: .editItem(id: "item-1", name: nil, note: .unchanged, fields: [:])
        )
        #expect(untouched.args.keys.contains("externalIds") == false)

        let replaced = try BFMInventoryCommandEncoding.envelope(
            for: .editItem(
                id: "item-1", name: nil, note: .unchanged, fields: [:],
                externalIds: [InventoryExternalIdentifier(kind: "serial", value: "SN-1")])
        )
        let ids = try #require(replaced.args["externalIds"] as? [(any Sendable)?])
        #expect(ids.count == 1)
        let first = try #require(ids.first as? [String: (any Sendable)?])
        #expect(first["kind"] as? String == "serial")
        #expect(first["value"] as? String == "SN-1")

        let emptied = try BFMInventoryCommandEncoding.envelope(
            for: .editItem(id: "item-1", name: nil, note: .unchanged, fields: [:], externalIds: [])
        )
        #expect((emptied.args["externalIds"] as? [(any Sendable)?])?.isEmpty == true)
    }

    @Test("createItem carries the new item's external identifiers")
    func createExternalIds() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .createItem(
                InventoryNewItem(
                    id: "item-9", name: "Drill", typeKey: nil,
                    externalIds: [InventoryExternalIdentifier(kind: "model", value: "DCD777")],
                    placement: .hand))
        )
        let item = try #require(envelope.args["item"] as? [String: (any Sendable)?])
        let ids = try #require(item["externalIds"] as? [(any Sendable)?])
        let first = try #require(ids.first as? [String: (any Sendable)?])
        #expect(first["kind"] as? String == "model")
        #expect(first["value"] as? String == "DCD777")
        let wire = try OpenAPIValueContainer(unvalidatedValue: envelope.args)
        #expect(String(describing: wire).contains("DCD777"))
    }

    @Test("setLifecycle carries the discard reason's wire spelling")
    func setLifecycle() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .setItemLifecycle(id: "item-1", lifecycle: .discarded, reason: .usedUp)
        )

        #expect(envelope.args["lifecycle"] as? String == "discarded")
        #expect(envelope.args["reason"] as? String == "used_up")
    }

    @Test("event.revert sends the reverted event's entity as the mutation's own")
    func revertCarriesItsEntity() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .revertEvent(seq: 3, entityKind: .location, entityId: "loc-1")
        )

        #expect(envelope.op == "event.revert")
        #expect(envelope.entityId == "loc-1")
        #expect(envelope.args.count == 1)
        #expect(envelope.args["seq"] as? Int == 3)
    }
}
