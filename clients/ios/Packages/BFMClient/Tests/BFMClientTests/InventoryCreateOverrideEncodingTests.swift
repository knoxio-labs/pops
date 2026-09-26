import AppCore
import Testing

@testable import BFMClient

@Suite("BFMInventoryCommandEncoding: a create carrying a computed-field override")
internal struct InventoryCreateOverrideEncodingTests {
    @Test("an override travels as a source-tagged value entry after the stored ones")
    func createCarriesOverride() throws {
        let width = InventoryPrimitiveValue.integer(try InventoryInteger(4))
        let volume = InventoryPrimitiveValue.integer(try InventoryInteger(9))
        let envelope = try BFMInventoryCommandEncoding.envelope(
            for: .createProtocol2Item(
                .init(
                    id: "item-9", name: "Box", catalogueRevision: 7, typeId: "type-7",
                    values: [.init(fieldId: "field-width", values: [width])],
                    overrides: [.init(fieldId: "field-volume", values: [volume])],
                    placement: .hand)))

        let item = try #require(envelope.args["item"] as? [String: (any Sendable)?])
        let values = try #require(item["values"] as? [(any Sendable)?])
        #expect(values.count == 2)
        let stored = try #require(values[0] as? [String: (any Sendable)?])
        #expect(stored["fieldId"] as? String == "field-width")
        #expect(stored.keys.contains("source") == false)
        let override = try #require(values[1] as? [String: (any Sendable)?])
        #expect(override["fieldId"] as? String == "field-volume")
        #expect(override["source"] as? String == "override")
        #expect((override["values"] as? [(any Sendable)?])?.first as? Int == 9)
    }
}
