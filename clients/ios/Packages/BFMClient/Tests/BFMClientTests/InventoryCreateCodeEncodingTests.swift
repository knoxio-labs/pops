import AppCore
import Testing

@testable import BFMClient

@Suite("BFMInventoryCommandEncoding: a create carrying its code")
internal struct InventoryCreateCodeEncodingTests {
    /// POPS-4063: the code rides inside `item.create`, beside `item`, so the
    /// server refuses a held code with the create itself; a create without
    /// one encodes exactly as before, with no `code` key at all.
    @Test("createItem carries its code beside the item, and omits the key without one")
    func createCarriesCode() throws {
        let coded = try BFMInventoryCommandEncoding.envelope(
            for: .createItem(
                InventoryNewItem(
                    id: "item-9", name: "Drill", typeKey: nil, placement: .hand, code: "B412")))
        #expect(coded.op == "item.create")
        #expect(coded.args["code"] as? String == "B412")
        let item = try #require(coded.args["item"] as? [String: (any Sendable)?])
        #expect(item["code"] == nil)

        let uncoded = try BFMInventoryCommandEncoding.envelope(
            for: .createItem(
                InventoryNewItem(id: "item-9", name: "Drill", typeKey: nil, placement: .hand)))
        #expect(uncoded.args.keys.contains("code") == false)

        let protocol2 = try BFMInventoryCommandEncoding.envelope(
            for: .createProtocol2Item(
                .init(
                    id: "item-9", name: "Drill", catalogueRevision: 7, typeId: "type-7",
                    placement: .hand, code: "C7")))
        #expect(protocol2.args["code"] as? String == "C7")
    }
}
