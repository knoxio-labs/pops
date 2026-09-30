import AppCore
import AppCoreFakes
import Testing

@testable import FeaturePurchases

@MainActor @Suite("Purchases tag picker")
internal struct PurchasesTagPickerTests {
    private static let tags = [
        PurchaseTagCount(tag: "garden", count: 4),
        PurchaseTagCount(tag: "camping", count: 2),
        PurchaseTagCount(tag: "Kitchen", count: 1),
    ]

    @Test("tags load in bounded pages and retain server order")
    internal func tagsPageInOrder() async {
        let repository = InMemoryPurchasesRepository(pageSize: 2, tagsInUse: Self.tags)
        let model = PurchasesTagPickerModel(repository: repository)

        model.updateQuery("")
        await model.load()

        #expect(model.tags == Array(Self.tags.prefix(2)))
        #expect(model.paging == .idle)
        #expect(await repository.tagsCalls.first?.cursor == nil)
        #expect(await repository.tagsCalls.first?.limit == 20)

        await model.loadNextPageIfNeeded()

        #expect(model.tags == Self.tags)
        #expect(model.paging == .exhausted)
        #expect(await repository.tagsCalls.count == 2)
    }

    @Test("tag search is sent to the repository before paging")
    internal func tagSearchIsServerFiltered() async {
        let repository = InMemoryPurchasesRepository(pageSize: 1, tagsInUse: Self.tags)
        let model = PurchasesTagPickerModel(repository: repository)

        model.updateQuery("garden")
        await model.load()

        #expect(model.tags == [Self.tags[0]])
        #expect(await repository.tagsCalls.first?.search == "garden")
        #expect(model.paging == .exhausted)
    }

    @Test("a next-page failure keeps rows and retries the same cursor")
    internal func retryUsesFailedCursor() async {
        let repository = InMemoryPurchasesRepository(pageSize: 1, tagsInUse: Self.tags)
        await repository.fail(onCall: 2, with: .unavailable)
        let model = PurchasesTagPickerModel(repository: repository)

        model.updateQuery("")
        await model.load()
        await model.loadNextPageIfNeeded()

        #expect(model.tags == [Self.tags[0]])
        #expect(model.paging == .failed)
        let failedCursor = await repository.tagsCalls[1].cursor

        await model.retryNextPage()

        #expect(model.tags == Array(Self.tags.prefix(2)))
        #expect(await repository.tagsCalls.map(\.cursor) == [nil, failedCursor, failedCursor])
        #expect(model.paging == .idle)
    }

    @Test("toggling adds an unselected tag")
    internal func togglingAdds() {
        #expect(PurchasesTagPicker.toggling("garden", in: []) == ["garden"])
    }

    @Test("toggling removes a selected tag")
    internal func togglingRemoves() {
        #expect(PurchasesTagPicker.toggling("garden", in: ["garden", "camping"]) == ["camping"])
    }

    @Test("a tag row's count label is the digits, and the Any row names none")
    internal func countLabel() {
        #expect(PurchasesTagPicker.countLabel(4) == "4")
        #expect(PurchasesTagPicker.countLabel(0) == "0")
        #expect(PurchasesTagPicker.countLabel(nil) == nil)
    }

    @Test("no tags in use at all, no query: the empty-collection state")
    internal func emptyStateWithNoTagsAndNoQuery() {
        let state = PurchasesTagPicker.emptyState(shown: [], tagsInUse: [], isSearching: false)

        #expect(state == .noTagsYet)
    }

    @Test("no tags in use at all, but a query is typed: the no-match state")
    internal func emptyStateWithNoTagsButSearching() {
        let state = PurchasesTagPicker.emptyState(shown: [], tagsInUse: [], isSearching: true)

        #expect(state == .noMatches)
    }

    @Test("tags exist but a query filtered every one out: the no-match state")
    internal func emptyStateWithTagsFilteredToNothing() {
        let state = PurchasesTagPicker.emptyState(
            shown: [], tagsInUse: Self.tags, isSearching: true)

        #expect(state == .noMatches)
    }

    @Test("anything shown is not an empty state")
    internal func emptyStateWithShownRows() {
        let state = PurchasesTagPicker.emptyState(
            shown: Self.tags, tagsInUse: Self.tags, isSearching: false)

        #expect(state == .none)
    }
}
