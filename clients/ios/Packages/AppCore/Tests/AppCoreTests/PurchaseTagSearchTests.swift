import AppCore
import AppCoreFakes
import Testing

@Suite("Purchase tag search")
internal struct PurchaseTagSearchTests {
    @Test("tag search filters before paging and preserves server ordering")
    func fakePurchaseTags() async throws {
        let seeded = [
            PurchaseTagCount(tag: "garden", count: 4),
            PurchaseTagCount(tag: "camping garden", count: 3),
            PurchaseTagCount(tag: "tool", count: 2),
            PurchaseTagCount(tag: "garden store", count: 1),
        ]
        let repository = InMemoryPurchasesRepository(pageSize: 2, tagsInUse: seeded)

        let first = try await repository.purchaseTags(search: "garden", after: nil, limit: 2)
        let second = try await repository.purchaseTags(
            search: "garden", after: first.nextCursor, limit: 2)

        #expect(first.tags == Array(seeded.prefix(2)))
        #expect(first.totalCount == 3)
        #expect(second.tags == [seeded[3]])
        #expect(second.nextCursor == nil)
        let calls = await repository.tagsCalls
        #expect(calls.map(\.search) == ["garden", "garden"])
        #expect(calls.map(\.cursor) == [nil, first.nextCursor])
    }

    @Test("tag cursor is bound to its search query")
    func tagCursorIsBoundToQuery() async throws {
        let repository = InMemoryPurchasesRepository(
            pageSize: 1,
            tagsInUse: [
                PurchaseTagCount(tag: "garden", count: 1),
                PurchaseTagCount(tag: "garden tools", count: 1),
            ])
        let first = try await repository.purchaseTags(search: "garden", after: nil, limit: 1)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchaseTags(search: "tool", after: first.nextCursor, limit: 1)
        }
    }
}
