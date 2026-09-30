import AppCore
import Testing

@testable import BFMClient

@Suite("BFMPurchasesRepository tag mapping")
internal struct PurchaseTagMappingTests {
    @Test("the tags in use keep the server's most-used-first order, carrying each count")
    func mapsTagsInUse() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .ok,
                json: #"""
                    {"tags":[
                        {"tag":"garden","count":5},
                        {"tag":"camping","count":2},
                        {"tag":"kitchen","count":2}
                    ],"nextCursor":null,"totalCount":3}
                    """#
            )
        )

        let page = try await repository.purchaseTags(search: "", after: nil, limit: 50)

        #expect(
            page.tags == [
                PurchaseTagCount(tag: "garden", count: 5),
                PurchaseTagCount(tag: "camping", count: 2),
                PurchaseTagCount(tag: "kitchen", count: 2),
            ])
        #expect(page.nextCursor == nil)
        #expect(page.totalCount == 3)
    }

    @Test("tag search sends its query and page cursor and maps page metadata")
    func tagsPageRequestAndResponse() async throws {
        let transport = StubTransport(
            status: .ok,
            json: #"{"tags":[{"tag":"garden","count":5}],"nextCursor":"tag-next","totalCount":9}"#)
        let repository = try BFMPurchasesRepository.stubbed(transport)

        let page = try await repository.purchaseTags(
            search: "garden", after: "tag-current", limit: 40)

        let sent = try #require(await transport.recorded.all.first)
        #expect(
            sent.request.path
                == "/mobile/purchases/tags?search=garden&cursor=tag-current&limit=40")
        #expect(page.tags == [PurchaseTagCount(tag: "garden", count: 5)])
        #expect(page.nextCursor == "tag-next")
        #expect(page.totalCount == 9)
    }

    @Test("no tags in use is an empty list, not a failure")
    func mapsNoTagsInUse() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(status: .ok, json: #"{"tags":[],"nextCursor":null}"#)
        )

        let tags = try await repository.purchaseTags(search: "", after: nil, limit: 50)

        #expect(tags.tags.isEmpty)
    }

    @Test("an unauthorized tags-in-use response is the app's unauthorized error")
    func purchaseTagsUnauthorized() async throws {
        let repository = try BFMPurchasesRepository.stubbed(
            StubTransport(
                status: .unauthorized, json: TransactionsWire.failure(code: "invalid_token"))
        )

        await #expect(throws: RepositoryError.unauthorized) {
            try await repository.purchaseTags(search: "", after: nil, limit: 50)
        }
    }
}
