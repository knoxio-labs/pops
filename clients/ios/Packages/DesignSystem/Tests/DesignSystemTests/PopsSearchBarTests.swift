import SwiftUI
import Testing

@testable import DesignSystem

@MainActor
@Suite("PopsSearchBar")
internal struct PopsSearchBarTests {
    private func bar(
        query: String = "", filterSummary: String = "", scan: (() -> Void)? = nil
    ) -> PopsSearchBar<EmptyView> {
        PopsSearchBar(
            query: .constant(query), tint: .popsAccent, isFiltered: false,
            filterSummary: filterSummary, onFilter: {}, scan: scan)
    }

    @Test("an empty search with scanning available offers Scan")
    func emptySearchOffersScan() {
        let search = bar(scan: {})

        #expect(search.trailingControl == .scan)
        #expect(search.trailingControl.accessibilityLabel == "Scan")
    }

    @Test("entered text replaces the scanner with Clear search")
    func textOffersClear() {
        let search = bar(query: "drill", scan: {})

        #expect(search.trailingControl == .clearSearch)
        #expect(search.trailingControl.accessibilityLabel == "Clear search")
    }

    @Test("an empty search without scanning offers Dictate")
    func emptySearchOffersDictation() {
        let search = bar()

        #expect(search.trailingControl == .dictate)
        #expect(search.trailingControl.accessibilityLabel == "Dictate")
    }

    @Test("the filter exposes its summary to accessibility")
    func filterExposesSummary() {
        #expect(bar(filterSummary: "Missing type").filterAccessibilityValue == "Missing type")
        #expect(bar().filterAccessibilityValue == "None")
    }
}
