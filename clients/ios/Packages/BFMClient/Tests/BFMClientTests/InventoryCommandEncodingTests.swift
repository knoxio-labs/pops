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

    @Test("protocol-2 writes encode stable IDs and canonical dynamic values")
    func protocol2Values() throws {
        let decimal = try InventoryDecimal("12.50")
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .createProtocol2Item(
                .init(
                    id: "item-9", name: "Drill", catalogueRevision: 7, typeId: "type-7",
                    values: [
                        .init(fieldId: "field-decimal", values: [.decimal(decimal)]),
                        .init(
                            fieldId: "field-reference",
                            values: [
                                .reference(
                                    .init(
                                        targetKind: .item, targetId: "target-1",
                                        targetState: .deleted))
                            ]),
                    ], placement: .hand)))

        #expect(envelope.op == "item.create")
        let item = try #require(envelope.args["item"] as? [String: (any Sendable)?])
        #expect(item["typeId"] as? String == "type-7")
        let values = try #require(item["values"] as? [(any Sendable)?])
        let decimalValue = try #require(values[0] as? [String: (any Sendable)?])
        #expect(decimalValue["fieldId"] as? String == "field-decimal")
        #expect((decimalValue["values"] as? [(any Sendable)?])?.first as? String == "12.50")
        let referenceValue = try #require(values[1] as? [String: (any Sendable)?])
        let referenceValues = try #require(referenceValue["values"] as? [(any Sendable)?])
        let reference = try #require(referenceValues.first as? [String: String])
        #expect(reference["targetKind"] == "item")
        #expect(reference["targetId"] == "target-1")
    }

    @Test("protocol-2 patches distinguish clearing a field from replacing it")
    func protocol2Patch() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .editProtocol2Item(
                id: "item-9", catalogueRevision: 7,
                values: [
                    .init(fieldId: "field-clear", values: nil),
                    .init(fieldId: "field-flag", values: [.boolean(true)]),
                ]))

        let values = try #require(envelope.args["values"] as? [(any Sendable)?])
        let clear = try #require(values[0] as? [String: (any Sendable)?])
        #expect(clear.keys.contains("values"))
        #expect((clear["values"] ?? "not present") == nil)
        let flag = try #require(values[1] as? [String: (any Sendable)?])
        #expect((flag["values"] as? [(any Sendable)?])?.first as? Bool == true)
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

    @Test("item.delete sends the vector file's op with no arguments")
    func deleteItem() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(for: .deleteItem(id: "item-1"))

        #expect(envelope.op == "item.delete")
        #expect(envelope.entityId == "item-1")
        #expect(envelope.args.isEmpty)
    }

    @Test("item.setOverride sends the field id and exactly one wire value")
    func setOverride() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .setComputedOverride(id: "item-1", fieldId: "field-1", value: .boolean(false)))

        #expect(envelope.op == "item.setOverride")
        #expect(envelope.entityId == "item-1")
        #expect(envelope.args["fieldId"] as? String == "field-1")
        let values = try #require(envelope.args["values"] as? [any Sendable])
        #expect(values.count == 1)
        #expect(values.first as? Bool == false)
    }

    @Test("an override on an enum or measurement field sends the server's object spelling")
    func setOverrideObjectValues() throws {
        let option = try BFMInventoryCommandEncoding.envelope(
            for: .setComputedOverride(
                id: "item-1", fieldId: "field-1", value: .enumeration(optionId: "opt-1")))
        let optionValue = try #require((option.args["values"] as? [any Sendable])?.first)
        let optionObject = try #require(optionValue as? [String: String])
        #expect(optionObject["optionId"] == "opt-1")

        let volume = try BFMInventoryCommandEncoding.envelope(
            for: .setComputedOverride(
                id: "item-1", fieldId: "field-2",
                value: .measurement(amount: try InventoryDecimal("1.500"), unit: "l")))
        let volumeValue = try #require((volume.args["values"] as? [any Sendable])?.first)
        let volumeObject = try #require(volumeValue as? [String: String])
        #expect(volumeObject["amount"] == "1.500")
        #expect(volumeObject["unit"] == "l")
        let wire = try OpenAPIValueContainer(unvalidatedValue: volume.args)
        #expect(String(describing: wire).contains("1.500"))
    }

    @Test("item.clearOverride sends only the field id")
    func clearOverride() throws {
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .clearComputedOverride(id: "item-1", fieldId: "field-1"))

        #expect(envelope.op == "item.clearOverride")
        #expect(envelope.entityId == "item-1")
        #expect(envelope.args.count == 1)
        #expect(envelope.args["fieldId"] as? String == "field-1")
    }
}
