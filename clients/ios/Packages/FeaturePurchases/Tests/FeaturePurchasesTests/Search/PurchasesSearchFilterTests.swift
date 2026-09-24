import AppCore
import Testing

@testable import FeaturePurchases

@Suite("Purchases search filter")
internal struct PurchasesSearchFilterTests {
    @Test("a default filter is inactive and has an empty summary")
    internal func defaultIsInactive() {
        let filter = PurchasesSearchFilter()

        #expect(!filter.isActive)
        #expect(filter.summary.isEmpty)
    }

    @Test("kind alone names itself in the summary")
    internal func kindAlone() {
        let filter = PurchasesSearchFilter(kind: .lines)

        #expect(filter.isActive)
        #expect(filter.summary == "Products")
    }

    @Test("status alone names itself in the summary")
    internal func statusAlone() {
        let filter = PurchasesSearchFilter(status: .matched)

        #expect(filter.isActive)
        #expect(filter.summary == "Matched")
    }

    @Test("kind and status both narrowed are named kind then status")
    internal func kindThenStatus() {
        let filter = PurchasesSearchFilter(kind: .purchases, status: .partial)

        #expect(filter.summary == "Purchases, Part matched")
    }

    @Test("chosen tags are listed sorted in the summary")
    internal func tagsAreSortedInSummary() {
        let filter = PurchasesSearchFilter(tags: ["garden", "camping"])

        #expect(filter.isActive)
        #expect(filter.tagSummary == "camping, garden")
        #expect(filter.summary == "camping, garden")
    }

    @Test("empty tags give no tag summary")
    internal func emptyTagsGiveNoSummary() {
        let filter = PurchasesSearchFilter()

        #expect(filter.tagSummary == nil)
    }

    @Test("kind, status and tags together are named in that order")
    internal func everyNarrowingInOrder() {
        let filter = PurchasesSearchFilter(kind: .lines, status: .matched, tags: ["garden"])

        #expect(filter.summary == "Products, Matched, garden")
    }

    @Test("no chosen tags carries any line")
    internal func noTagsCarriesEverything() {
        #expect(PurchasesSearchFilter().carries([]))
        #expect(PurchasesSearchFilter().carries(["garden"]))
    }

    @Test("a chosen tag carries a line holding any of the chosen tags")
    internal func anyOfChosenTagsCarries() {
        let filter = PurchasesSearchFilter(tags: ["garden", "camping"])

        #expect(filter.carries(["garden"]))
        #expect(filter.carries(["camping", "kitchen"]))
    }

    @Test("a line with none of the chosen tags does not carry")
    internal func noOverlapDoesNotCarry() {
        let filter = PurchasesSearchFilter(tags: ["garden"])

        #expect(!filter.carries([]))
        #expect(!filter.carries(["kitchen"]))
    }
}
