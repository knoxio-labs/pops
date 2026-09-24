import Testing

@testable import DesignPlayground

/// The playground's own copy of `FeatureInventory.InventoryValueTruncation`
/// (see `InventoryPropertyChrome.swift` for why it is a copy rather than a
/// shared dependency). Kept to the same threshold and the same tests, so a
/// change to one that is not mirrored in the other is caught here rather than
/// only noticed by eye on the "Long text and many values" state.
@Suite("Large detail values collapse in the playground's property line too")
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
