import AppCore
import AppCoreFakes
import Testing

@Suite("In-memory protocol 2 inventory store")
internal struct InMemoryInventoryProtocol2StoreTests {
    @Test("protocol-2 edits retain stable fields and clear only the named field")
    func protocol2EditRetainsStableFields() async throws {
        let store = InMemoryInventoryStore()
        _ = try await store.perform(
            .createProtocol2Item(
                .init(
                    id: "item-1", name: "Drill", catalogueRevision: 7, typeId: "type-1",
                    values: [
                        .init(fieldId: "field-one", values: [.string("one")]),
                        .init(fieldId: "field-two", values: [.boolean(true)]),
                    ], placement: .hand)))

        _ = try await store.perform(
            .editProtocol2Item(
                id: "item-1", catalogueRevision: 7,
                values: [
                    .init(fieldId: "field-one", values: [.string("updated")]),
                    .init(fieldId: "field-two", values: nil),
                ]))

        var values = store.observe(.item(id: "item-1")).makeAsyncIterator()
        let item = try #require(await values.next())
        #expect(item?.catalogueRevision == 7)
        #expect(item?.typeId == "type-1")
        #expect(
            item?.fieldValues == [
                .init(
                    fieldId: "field-one", state: .value([.string("updated")]), source: .stored,
                    catalogueRevision: 7)
            ])
    }
}
