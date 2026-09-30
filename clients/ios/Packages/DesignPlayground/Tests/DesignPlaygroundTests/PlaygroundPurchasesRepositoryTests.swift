import AppCore
import Testing

@testable import DesignPlayground

@Suite("Playground purchases repository")
internal struct PlaygroundPurchasesRepositoryTests {
    @Test("tag pages filter before limiting and continue with a query-bound cursor")
    func tagPages() async throws {
        let repository = PlaygroundPurchasesRepository(rows: [], failure: nil, hangs: false)

        let first = try await repository.purchaseTags(search: "", after: nil, limit: 2)
        let second = try await repository.purchaseTags(
            search: "", after: first.nextCursor, limit: 2)

        #expect(
            first.tags
                == Array(PurchasesSearchFixtures.tagsInUse.prefix(2)).map {
                    PurchaseTagCount(tag: $0.tag, count: $0.count)
                })
        #expect(first.nextCursor != nil)
        #expect(first.totalCount == PurchasesSearchFixtures.tagsInUse.count)
        #expect(
            second.tags
                == Array(PurchasesSearchFixtures.tagsInUse.dropFirst(2).prefix(2)).map {
                    PurchaseTagCount(tag: $0.tag, count: $0.count)
                })
        #expect(second.totalCount == nil)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.purchaseTags(search: "tool", after: first.nextCursor, limit: 2)
        }
    }

    @Test("tag pages preserve configured repository failures")
    func tagPageFailure() async {
        let repository = PlaygroundPurchasesRepository(
            rows: [], failure: .unavailable, hangs: false)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.purchaseTags(search: "", after: nil, limit: 2)
        }
    }
}
