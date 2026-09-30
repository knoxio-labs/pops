import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("Purchase search")
internal struct PurchaseSearchTests {
    @Test("purchase and line identities cannot collide")
    func kindPrefixesIdentity() {
        let order = Self.order(id: "shared")
        let purchase = PurchaseSearchHit.purchase(order, printedMatch: nil)
        let line = PurchaseSearchHit.line(
            id: "shared",
            name: "Milk",
            quantity: 1,
            lineTotal: Self.money(500),
            order: order,
            tagMatch: nil)

        #expect(purchase.id == "purchase:shared")
        #expect(line.id == "line:shared")
        #expect(purchase.id != line.id)
    }

    @Test("line results preserve their order context")
    func linePreservesOrder() {
        let order = Self.order(id: "order-17", merchant: .printed("Corner Store"))
        let hit = PurchaseSearchHit.line(
            id: "line-3",
            name: "Bread",
            quantity: 2,
            lineTotal: Self.money(900),
            order: order,
            tagMatch: "grocery")

        #expect(hit.order == order)
    }

    @Test("fake search filters text across match fields without case sensitivity")
    func fakeFiltersText() async throws {
        let order = Self.order(
            id: "order-1",
            merchant: .entity(id: "merchant-1", name: "The Grocer", printed: "TILL MART"))
        let repository = InMemoryPurchasesRepository(hits: [
            .purchase(order, printedMatch: "TILL MART"),
            .line(
                id: "line-1", name: "Full Cream Milk", quantity: 1,
                lineTotal: Self.money(450), order: order, tagMatch: "Dairy"),
        ])

        let printed = try await repository.search(
            text: "till", kind: .all, status: .any, tags: [], after: nil, limit: 5)
        let tagged = try await repository.search(
            text: "dairy", kind: .all, status: .any, tags: [], after: nil, limit: 5)

        #expect(printed.hits.map(\.id) == ["purchase:order-1", "line:line-1"])
        #expect(tagged.hits.map(\.id) == ["line:line-1"])
        let calls = await repository.searchCalls
        #expect(calls.count == 2)
        #expect(calls[0].text == "till")
        #expect(calls[0].status == .any)
    }

    @Test("unmatched search retains only awaiting-settlement orders and their lines")
    func fakeFiltersUnmatched() async throws {
        let awaiting = Self.order(id: "waiting", status: .awaitingSettlement)
        let partial = Self.order(id: "partial", status: .partial)
        let repository = InMemoryPurchasesRepository(hits: [
            .purchase(awaiting, printedMatch: nil),
            .line(
                id: "waiting-line", name: "Milk", quantity: 1,
                lineTotal: Self.money(400), order: awaiting, tagMatch: nil),
            .purchase(partial, printedMatch: nil),
        ])

        let results = try await repository.search(
            text: "fake", kind: .all, status: .unmatched, tags: [], after: nil, limit: 5)

        #expect(results.hits.map(\.id) == ["purchase:waiting", "line:waiting-line"])
    }

    @Test("blank text matches nothing and records no search", arguments: ["", "   "])
    func fakeBlankTextMatchesNothing(text: String) async throws {
        let repository = InMemoryPurchasesRepository(hits: [
            .purchase(Self.order(id: "waiting", status: .awaitingSettlement), printedMatch: nil)
        ])

        let results = try await repository.search(
            text: text, kind: .all, status: .unmatched, tags: [], after: nil, limit: 5)

        #expect(results.hits.isEmpty)
        #expect(results.nextCursor == nil)
        #expect(await repository.searchCalls.isEmpty)
    }

    @Test("chosen tags are recorded on the call the fake receives")
    func fakeRecordsTags() async throws {
        let repository = InMemoryPurchasesRepository(hits: [])

        _ = try await repository.search(
            text: "fake", kind: .all, status: .any, tags: ["garden", "camping"], after: nil,
            limit: 4)

        let calls = await repository.searchCalls
        #expect(calls.first?.tags == ["garden", "camping"])
        #expect(calls.first?.cursor == nil)
        #expect(calls.first?.limit == 4)
    }

    @Test("search predicates run before the page limit and later matches remain reachable")
    func searchFiltersBeforePaging() async throws {
        let matchingOrder = Self.order(id: "match-1")
        let unmatchedOrder = Self.order(id: "wrong-status", status: .awaitingSettlement)
        let matchingHits: [PurchaseSearchHit] = [
            .purchase(matchingOrder, printedMatch: "needle"),
            .line(
                id: "wrong-tag", name: "needle one", quantity: 1, lineTotal: Self.money(100),
                order: matchingOrder, tagMatch: "other"),
            .line(
                id: "wrong-status", name: "needle two", quantity: 1, lineTotal: Self.money(100),
                order: unmatchedOrder, tagMatch: "garden"),
            .line(
                id: "line-1", name: "needle three", quantity: 1, lineTotal: Self.money(100),
                order: matchingOrder, tagMatch: "garden"),
            .line(
                id: "line-2", name: "needle four", quantity: 1, lineTotal: Self.money(100),
                order: matchingOrder, tagMatch: "garden"),
            .line(
                id: "line-3", name: "needle five", quantity: 1, lineTotal: Self.money(100),
                order: matchingOrder, tagMatch: "garden"),
        ]
        let repository = InMemoryPurchasesRepository(hits: matchingHits, pageSize: 2)

        let first = try await repository.search(
            text: "needle", kind: .all, status: .matched, tags: ["garden"], after: nil, limit: 2)
        let second = try await repository.search(
            text: "needle", kind: .all, status: .matched, tags: ["garden"], after: first.nextCursor,
            limit: 2)

        #expect(first.hits.map(\.id) == ["line:line-1", "line:line-2"])
        #expect(first.totalCount == 3)
        #expect(second.hits.map(\.id) == ["line:line-3"])
        #expect(second.nextCursor == nil)
        #expect(second.totalCount == nil)
    }

    @Test("search kind filters before paging and binds the cursor")
    func searchKindFiltersBeforePaging() async throws {
        let firstOrder = Self.order(id: "purchase-1")
        let secondOrder = Self.order(id: "purchase-2")
        let repository = InMemoryPurchasesRepository(
            hits: [
                .purchase(firstOrder, printedMatch: "needle one"),
                .line(
                    id: "line-1", name: "needle line one", quantity: 1,
                    lineTotal: Self.money(100), order: firstOrder, tagMatch: nil),
                .purchase(secondOrder, printedMatch: "needle two"),
                .line(
                    id: "line-2", name: "needle line two", quantity: 1,
                    lineTotal: Self.money(100), order: secondOrder, tagMatch: nil),
            ], pageSize: 1)

        let firstLinePage = try await repository.search(
            text: "needle", kind: .lines, status: .any, tags: [], after: nil, limit: 1)
        let secondLinePage = try await repository.search(
            text: "needle", kind: .lines, status: .any, tags: [],
            after: firstLinePage.nextCursor, limit: 1)
        let firstPurchasePage = try await repository.search(
            text: "needle", kind: .purchases, status: .any, tags: [], after: nil, limit: 1)

        #expect(firstLinePage.hits.map(\.id) == ["line:line-1"])
        #expect(secondLinePage.hits.map(\.id) == ["line:line-2"])
        #expect(firstLinePage.totalCount == 2)
        #expect(firstPurchasePage.hits.map(\.id) == ["purchase:purchase-1"])

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.search(
                text: "needle", kind: .purchases, status: .any, tags: [],
                after: firstLinePage.nextCursor, limit: 1)
        }
    }

    @Test("search rejects a cursor minted for different filters")
    func searchCursorIsBoundToQuery() async throws {
        let order = Self.order(id: "match")
        let repository = InMemoryPurchasesRepository(
            hits: (0..<3).map { index in
                .purchase(order, printedMatch: "needle \(index)")
            }, pageSize: 1)
        let first = try await repository.search(
            text: "needle", kind: .all, status: .matched, tags: [], after: nil, limit: 1)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await repository.search(
                text: "needle", kind: .all, status: .any, tags: [], after: first.nextCursor,
                limit: 1)
        }
    }

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

    private static func order(
        id: String,
        merchant: MerchantIdentity = .printed("Fake Store"),
        status: PurchaseSettlement = .linked
    ) -> PurchaseSearchOrder {
        PurchaseSearchOrder(
            id: id,
            merchant: merchant,
            orderedOn: Date(timeIntervalSince1970: 1_700_000_000),
            total: money(2_500),
            status: status)
    }

    private static func money(_ cents: Int) -> MoneyAmount {
        MoneyAmount(minorUnits: cents, currencyCode: "AUD")
    }
}
