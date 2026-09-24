import Testing

@testable import FeatureInventory

@Suite("Large detail values collapse rather than lengthen the page")
internal struct InventoryValueTruncationTests {
    @Test("a value at the threshold is not yet long")
    func atThresholdIsNotLong() {
        let value = String(repeating: "a", count: InventoryValueTruncation.longValueThreshold)
        #expect(!InventoryValueTruncation.isLong(value))
    }

    @Test("one character past the threshold is long")
    func oneOverThresholdIsLong() {
        let value = String(repeating: "a", count: InventoryValueTruncation.longValueThreshold + 1)
        #expect(InventoryValueTruncation.isLong(value))
    }

    @Test("an empty value is never long")
    func emptyIsNotLong() {
        #expect(!InventoryValueTruncation.isLong(""))
    }

    @Test("a 20,000-character long-text field's maximum is long")
    func maximumLongTextValueIsLong() {
        #expect(InventoryValueTruncation.isLong(String(repeating: "a", count: 20_000)))
    }

    @Test("many short values joined by the display separator can add up to long")
    func manyJoinedShortValuesCanBeLong() {
        let joined = Array(repeating: "tag", count: 120).joined(separator: " · ")
        #expect(InventoryValueTruncation.isLong(joined))
    }

    @Test("a handful of short joined values stays short")
    func fewJoinedShortValuesStayShort() {
        let joined = ["blue", "red", "green"].joined(separator: " · ")
        #expect(!InventoryValueTruncation.isLong(joined))
    }
}
