import Testing

@testable import DesignPlayground

@Suite("Name mark palette")
internal struct NameMarkPaletteTests {
    @Test("the same institution name maps to a fixed palette index")
    func fixedIndex() {
        #expect(NameMarkPalette.index(for: "ANZ") == 1)
    }

    @Test("empty and non-ASCII names produce valid palette indexes")
    func scalarBoundaries() {
        #expect(NameMarkPalette.index(for: "") == 0)
        #expect(NameMarkPalette.index(for: "🍎") == 3)
    }
}
