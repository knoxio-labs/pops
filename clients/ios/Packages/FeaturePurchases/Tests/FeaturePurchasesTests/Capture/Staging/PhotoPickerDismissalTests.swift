import Testing

@testable import FeaturePurchases

@Suite("Photo picker dismissal")
internal struct PhotoPickerDismissalTests {
    @Test("a dismissal with nothing picked is a cancel")
    func emptyDismissalCancels() {
        var dismissal = PhotoPickerDismissal()
        let cancelled = dismissal.settle()
        #expect(cancelled)
    }

    @Test("a selection that arrives before the dismissal settles is not a cancel")
    func selectionBeforeSettling() {
        var dismissal = PhotoPickerDismissal()
        dismissal.selectionArrived()
        let cancelled = dismissal.settle()
        #expect(!cancelled)
    }

    @Test("each dismissal settles on its own: a pick does not excuse the next empty dismissal")
    func settlesResetBetweenDismissals() {
        var dismissal = PhotoPickerDismissal()
        dismissal.selectionArrived()
        _ = dismissal.settle()
        let cancelled = dismissal.settle()
        #expect(cancelled)
    }
}
