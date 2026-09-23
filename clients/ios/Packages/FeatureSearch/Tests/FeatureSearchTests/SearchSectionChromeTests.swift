import AppCore
import DesignSystem
import SwiftUI
import Testing

@testable import FeatureSearch

@Suite("Search section chrome")
internal struct SearchSectionChromeTests {
    @Test("unscoped sections expose uncapped totals")
    func unscopedTrailing() {
        #expect(
            SearchSectionHeaderTrailing(
                shown: 3, total: 5, isRefining: false, isScoped: false
            ) == .showAll(5))
        #expect(
            SearchSectionHeaderTrailing(
                shown: 5, total: 5, isRefining: false, isScoped: false
            ) == .count(5))
    }

    @Test("refining and scoped sections choose stable trailing treatments")
    func refiningAndScopedTrailing() {
        #expect(
            SearchSectionHeaderTrailing(
                shown: 3, total: 5, isRefining: true, isScoped: false
            ) == .pending)
        #expect(
            SearchSectionHeaderTrailing(
                shown: 3, total: 5, isRefining: true, isScoped: true
            ) == .none)
        #expect(
            SearchSectionHeaderTrailing(
                shown: 3, total: 5, isRefining: false, isScoped: true
            ) == .count(5))
    }

    @Test("chip statuses speak counts and availability")
    func chipStatusSpeech() {
        #expect(SearchChipStatus.none.spoken == "")
        #expect(SearchChipStatus.count(1).spoken == "1 result")
        #expect(SearchChipStatus.count(2).spoken == "2 results")
        #expect(SearchChipStatus.pending.spoken == "Searching")
        #expect(SearchChipStatus.failed.spoken == "Didn't answer")
        #expect(SearchChipStatus.offline.spoken == "Offline")
        #expect(SearchChipStatus.notOnPhone.spoken == "Not on this phone")
    }

    @Test("pillars and all-results scope keep distinct accents")
    func tintMapping() {
        #expect(SearchPillar.inventory.tint == Color.popsInventory)
        #expect(SearchPillar.purchases.tint == Color.popsPurchases)
        #expect(SearchPillar.inventory.tint != SearchPillar.purchases.tint)
        #expect(SearchScope.all.tint == Color.popsAccent)
        #expect(SearchScope.pillar(.inventory).tint == Color.popsInventory)
    }
}
