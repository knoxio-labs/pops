import AppCore
import SwiftUI
import Testing

@testable import FeatureSearch

@Suite("Universal search screen")
internal struct UniversalSearchScreenTests {
    @Test("content choice distinguishes recents, empty states and sections")
    internal func contentChoice() {
        #expect(
            UniversalSearchContentChoice(query: "  ", hasNoResults: true, isFiltered: true)
                == .recents)
        #expect(
            UniversalSearchContentChoice(query: "bolts", hasNoResults: true, isFiltered: true)
                == .filteredEmpty)
        #expect(
            UniversalSearchContentChoice(query: " bolts ", hasNoResults: true, isFiltered: false)
                == .queryEmpty("bolts"))
        #expect(
            UniversalSearchContentChoice(query: "bolts", hasNoResults: false, isFiltered: false)
                == .sections)
    }

    @Test("picking a recent restores scope before query")
    internal func selectionOrder() {
        var events: [String] = []
        let recent = SearchRecent(query: "office", scope: .pillar(.inventory))

        SearchRecentSelection.apply(
            recent,
            setScope: { scope in
                events.append(scope == .pillar(.inventory) ? "scope" : "wrong scope")
            },
            setQuery: { query in events.append(query) })

        #expect(events == ["scope", "office"])
    }

    @Test("Reset is disabled only while no filter is active")
    internal func resetAvailability() {
        #expect(UniversalSearchFilterSheet<EmptyView>.resetDisabled(isFiltered: false))
        #expect(!UniversalSearchFilterSheet<EmptyView>.resetDisabled(isFiltered: true))
    }
}
