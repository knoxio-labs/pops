import CoreGraphics
import Testing

@testable import FeatureReceiptCapture

/// The sizing rule on its own, with numbers a test chooses rather than
/// whatever a camera happened to produce.
@Suite("Receipt page budget")
internal struct ReceiptPageBudgetTests {
    private static let budget = ReceiptPageBudget(longestEdge: 100, compressionQuality: 0.8)

    @Test("an oversized page is brought to the longest edge, keeping its proportions")
    func oversizedPagesAreFitted() {
        let fitted = Self.budget.fittedSize(for: CGSize(width: 200, height: 400))

        #expect(fitted == CGSize(width: 50, height: 100))
    }

    /// Whichever side is longer, not whichever is the height. A receipt
    /// photographed sideways is the same picture.
    @Test("the longer side is the one that is bounded, whichever it is")
    func orientationDoesNotMatter() {
        let landscape = Self.budget.fittedSize(for: CGSize(width: 400, height: 200))

        #expect(landscape == CGSize(width: 100, height: 50))
    }

    /// Enlarging invents pixels: a bigger upload that is no easier to read.
    @Test("a page already inside the budget is left exactly as it was")
    func smallPagesAreNotUpscaled() {
        let size = CGSize(width: 20, height: 30)

        #expect(Self.budget.scale(for: size) == 1)
        #expect(Self.budget.fittedSize(for: size) == size)
    }

    @Test("a page exactly at the budget is left alone")
    func theBoundaryIsNotResized() {
        let size = CGSize(width: 60, height: 100)

        #expect(Self.budget.fittedSize(for: size) == size)
    }

    /// A degenerate size divides by zero if the guard is written the other way
    /// round, and a scan can hand back anything.
    @Test("a zero-sized page does not produce a nonsense scale")
    func zeroIsSurvivable() {
        #expect(Self.budget.scale(for: .zero) == 1)
    }

    /// The shipped numbers, asserted because they are the ones an upload's size
    /// actually depends on — a budget quietly widened to the point of being no
    /// budget would leave every test above passing.
    @Test("the shipped budget bounds a full-resolution phone photograph")
    func theStandardBudgetBounds() {
        let phonePage = CGSize(width: 3024, height: 4032)
        let fitted = ReceiptPageBudget.standard.fittedSize(for: phonePage)

        #expect(max(fitted.width, fitted.height) == ReceiptPageBudget.standard.longestEdge)
        #expect(fitted.height < phonePage.height)
        #expect(ReceiptPageBudget.standard.compressionQuality < 1)
    }
}
