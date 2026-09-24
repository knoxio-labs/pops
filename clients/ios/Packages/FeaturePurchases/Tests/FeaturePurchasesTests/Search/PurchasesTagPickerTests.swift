import AppCore
import Testing

@testable import FeaturePurchases

@Suite("Purchases tag picker")
internal struct PurchasesTagPickerTests {
    private static let tags = [
        PurchaseTagCount(tag: "garden", count: 4),
        PurchaseTagCount(tag: "camping", count: 2),
        PurchaseTagCount(tag: "Kitchen", count: 1),
    ]

    @Test("a blank query keeps every tag, in order")
    internal func blankQueryKeepsOrder() {
        #expect(PurchasesTagPicker.matching(Self.tags, "") == Self.tags)
        #expect(PurchasesTagPicker.matching(Self.tags, "   ") == Self.tags)
    }

    @Test("matching ignores case and keeps the given order")
    internal func matchingIgnoresCase() {
        let matched = PurchasesTagPicker.matching(Self.tags, "k")

        #expect(matched.map(\.tag) == ["Kitchen"])
    }

    @Test("a query with no match returns nothing")
    internal func noMatchReturnsNothing() {
        #expect(PurchasesTagPicker.matching(Self.tags, "zzz").isEmpty)
    }

    @Test("matching is nonisolated: a nonisolated test can call it directly")
    internal nonisolated func matchingIsNonisolated() {
        #expect(PurchasesTagPicker.matching(Self.tags, "garden").map(\.tag) == ["garden"])
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
