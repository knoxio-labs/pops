import SwiftUI
import Testing

@testable import FeaturePurchases

@Suite("Purchases home presentation")
@MainActor
internal struct PurchasesHomePresentationTests {
    @Test("every repository failure has its own symbol and title")
    func failuresStayDistinct() {
        #expect(Set(PurchasesHomeFailure.allCases.map(\.symbol)).count == 5)
        #expect(Set(PurchasesHomeFailure.allCases.map(\.title)).count == 5)
    }

    @Test("failure actions only offer a step that can help")
    func failureActions() {
        #expect(PurchasesHomeFailure.unavailable.action == .retry)
        #expect(PurchasesHomeFailure.transport.action == .retry)
        #expect(PurchasesHomeFailure.unauthorized.action == .pair)
        #expect(PurchasesHomeFailure.contractMismatch.action == nil)
        #expect(PurchasesHomeFailure.dependencyNotBound.action == nil)
    }

    @Test("purchase count uses singular and plural copy")
    func countGrammar() {
        #expect(PurchasesHomeCopy.count(1, currencies: 1) == "1 purchase")
        #expect(PurchasesHomeCopy.count(2, currencies: 1) == "2 purchases")
    }

    @Test("currency suffix appears only when several currencies are present")
    func currencySuffix() {
        #expect(PurchasesHomeCopy.count(2, currencies: 1) == "2 purchases")
        #expect(
            PurchasesHomeCopy.count(2, currencies: 3) == "2 purchases in 3 currencies")
    }

    @Test("a missing comparison has no delta line")
    func missingDelta() {
        #expect(PurchasesHomeCopy.deltaLine(nil) == nil)
    }

    @Test("empty history and an empty current month say different things")
    func emptyStates() {
        #expect(PurchasesHomeCopy.emptyHistory == "No purchases")
        #expect(PurchasesHomeCopy.emptyMonth == "No purchases this month")
        #expect(PurchasesHomeCopy.emptyHistory != PurchasesHomeCopy.emptyMonth)
    }

    @Test("refresh failure copy includes the last update time")
    func refreshFailureCopy() {
        #expect(PurchasesHomeCopy.refreshFailure("9:41") == "Not updated · 9:41")
    }

    @Test("tiles stack at every accessibility Dynamic Type size")
    func tileLayout() {
        #expect(!PurchasesHomeTileLayout.stacks(at: .xxxLarge))
        for size in DynamicTypeSize.allCases where size.isAccessibilitySize {
            #expect(PurchasesHomeTileLayout.stacks(at: size))
        }
    }

    @Test("unmatched tile is hidden only for a zero count")
    func unmatchedVisibility() {
        #expect(!PurchasesHomeTileLayout.showsUnmatched(count: 0))
        #expect(PurchasesHomeTileLayout.showsUnmatched(count: 1))
    }
}
