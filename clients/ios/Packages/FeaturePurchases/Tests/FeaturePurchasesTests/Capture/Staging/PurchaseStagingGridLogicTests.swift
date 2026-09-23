import Testing

@testable import FeaturePurchases

@Suite("Purchase staging grid logic")
internal struct PurchaseStagingGridLogicTests {
    @Test("an empty grid's Cancel leaves at once")
    func emptyCancelLeaves() {
        #expect(PurchaseStagingGridLogic.cancel(isEmpty: true) == .leave)
    }

    @Test("a grid with pages asks before discarding them")
    func stagedCancelConfirms() {
        #expect(PurchaseStagingGridLogic.cancel(isEmpty: false) == .confirmDiscard)
    }

    @Test("entering a target highlights it, replacing any other")
    func enterHighlights() {
        #expect(
            PurchaseStagingGridLogic.highlight(after: true, on: .loose, current: .receipt("r1"))
                == .loose)
    }

    @Test("leaving the highlighted target clears it")
    func exitClears() {
        #expect(
            PurchaseStagingGridLogic.highlight(after: false, on: .page("a"), current: .page("a"))
                == nil)
    }

    @Test("a late exit from an older target keeps the newer highlight")
    func lateExitKeepsNewer() {
        #expect(
            PurchaseStagingGridLogic.highlight(after: false, on: .page("a"), current: .loose)
                == .loose)
    }
}
