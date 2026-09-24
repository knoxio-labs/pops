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
}
