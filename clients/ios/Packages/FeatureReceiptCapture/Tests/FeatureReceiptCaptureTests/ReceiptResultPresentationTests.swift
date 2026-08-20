import AppCore
import Testing

@testable import FeatureReceiptCapture

/// What the result screen says, per outcome — pinned as a value rather than as
/// a rendered view, so what changed is the assertion's business rather than a
/// pixel diff's.
@Suite("Receipt result presentation")
internal struct ReceiptResultPresentationTests {
    private static let presentation = ReceiptResultPresentation()

    /// One claim about the whole reading rather than one per group: each
    /// group being internally right while the order between them went wrong
    /// is exactly the regression a per-group assertion cannot see.
    @Test("every field the extraction sent draws, in receipt order")
    func needsReviewDrawsEveryField() {
        let extracted = ExtractedReceipt.fake(
            discounts: ["2.00"],
            surcharges: ["1.50"],
            shipping: "5.00",
            lines: [
                .fake(description: "Milk", amount: "4.50"),
                .fake(description: "Bread", amount: "3.20"),
            ],
            unreadableNotes: ["torn corner"]
        )
        let result = Self.presentation.content(
            .needsReview(receiptCount: 1, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(
            content.orderedFields.map(\.label) == [
                ReceiptResultCopy.FieldLabel.merchant,
                ReceiptResultCopy.FieldLabel.address,
                ReceiptResultCopy.FieldLabel.date,
                ReceiptResultCopy.FieldLabel.total,
                ReceiptResultCopy.FieldLabel.tax,
                ReceiptResultCopy.FieldLabel.discounts,
                ReceiptResultCopy.FieldLabel.surcharges,
                ReceiptResultCopy.FieldLabel.shipping,
                ReceiptResultCopy.FieldLabel.unreadableNotes,
            ])
    }

    /// The figure the whole reading is checked against is not one of the
    /// adjustments beside it. Drawing it as a fourth row of tax and shipping
    /// is how a reader loses which number is which.
    @Test("the stated total is held apart from what adjusts it")
    func totalIsNotAnAdjustment() throws {
        let extracted = ExtractedReceipt.fake(
            total: "42.50", tax: "3.86", discounts: ["2.00"], surcharges: ["1.50"],
            shipping: "5.00")
        let result = Self.presentation.content(
            .needsReview(receiptCount: 1, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        let total = try #require(content.total)
        #expect(total.value == "42.50")
        #expect(!content.adjustments.contains { $0.label == ReceiptResultCopy.FieldLabel.total })
        #expect(
            content.adjustments.map(\.label) == [
                ReceiptResultCopy.FieldLabel.tax,
                ReceiptResultCopy.FieldLabel.discounts,
                ReceiptResultCopy.FieldLabel.surcharges,
                ReceiptResultCopy.FieldLabel.shipping,
            ])
    }

    /// Three different kinds of fact, drawn at three weights — so the screen
    /// has to know which is which rather than holding an interchangeable
    /// list.
    @Test("who and when are held apart from each other")
    func identityIsNamedRatherThanListed() throws {
        let result = Self.presentation.content(
            .needsReview(receiptCount: 1, failures: [.fake()], extracted: .fake()))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(try #require(content.identity.merchant).value == "Test Grocer")
        #expect(try #require(content.identity.address).value == "1 Test Street")
        #expect(try #require(content.identity.date).value == "2026-08-01 14:32")
    }

    /// A field the receipt never stated is dropped, not drawn as a dash — a
    /// screen a reviewer trusts cannot pad itself out with placeholders.
    @Test("a field the extraction has nothing for is not drawn")
    func absentFieldsAreDropped() {
        let extracted = ExtractedReceipt.fake(
            merchantName: nil, address: nil, purchasedOn: nil, purchasedAt: nil, tax: nil,
            discounts: [], surcharges: [], shipping: nil, lines: [], unreadableNotes: [])
        let result = Self.presentation.content(
            .needsReview(receiptCount: 0, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(content.orderedFields.map(\.label) == [ReceiptResultCopy.FieldLabel.total])
        #expect(content.identity.isEmpty)
        #expect(content.lines.isEmpty)
        #expect(content.notes == nil)
        #expect(content.photoCount == nil)
    }

    @Test("whitespace is not a value")
    func whitespaceIsDropped() {
        let extracted = ExtractedReceipt.fake(merchantName: "   \n ")
        let result = Self.presentation.content(
            .needsReview(receiptCount: 0, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(content.identity.merchant == nil)
    }

    /// A value that is *not* whitespace-only still has its surrounding
    /// whitespace trimmed — the receipt printed the padding, not the reader.
    @Test("surrounding whitespace on a real value is trimmed, not preserved")
    func surroundingWhitespaceIsTrimmed() throws {
        let extracted = ExtractedReceipt.fake(merchantName: "  Test Grocer  \n")
        let result = Self.presentation.content(
            .needsReview(receiptCount: 0, failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        let merchant = try #require(content.identity.merchant)
        #expect(merchant.value == "Test Grocer")
    }

    @Test("a sum mismatch carries how far off it was")
    func sumMismatchCarriesTheDelta() throws {
        let failure = ReceiptGateFailure.fake(
            kind: .sumMismatch, detail: "lines vs total", deltaCents: -137)
        let result = Self.presentation.content(
            .needsReview(receiptCount: 0, failures: [failure], extracted: .fake()))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        let line = try #require(content.failureLines.first)
        #expect(line.value.contains("lines vs total"))
        #expect(line.value.contains(ReceiptResultCopy.deltaCents(-137)))
    }

    /// A failure kind with no ``AppCore/ReceiptGateFailureKind/deltaCents``
    /// draws no delta phrase at all — inventing one would claim the gate said
    /// something about a distance it never measured.
    @Test("a failure with no delta draws no delta phrase")
    func noDeltaMeansNoDeltaPhrase() throws {
        let failure = ReceiptGateFailure.fake(
            kind: .noLines, detail: "no lines read", deltaCents: nil)
        let result = Self.presentation.content(
            .needsReview(receiptCount: 0, failures: [failure], extracted: .fake()))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        let line = try #require(content.failureLines.first)
        #expect(line.value == "no lines read")
    }

    /// Two failures sharing a kind must not collide under `ForEach`, which
    /// identifies rows by ``ReceiptResultContent/Field/id``.
    @Test("two failures of the same kind are distinctly identified")
    func repeatedKindsAreDistinctlyIdentified() {
        let failures = [
            ReceiptGateFailure.fake(kind: .negativeLine, detail: "line 1", deltaCents: nil),
            ReceiptGateFailure.fake(kind: .negativeLine, detail: "line 2", deltaCents: nil),
        ]
        let result = Self.presentation.content(
            .needsReview(receiptCount: 0, failures: failures, extracted: .fake()))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(Set(content.failureLines.map(\.id)).count == content.failureLines.count)
        #expect(
            content.failureLines.map(\.label) == [
                ReceiptResultCopy.gateFailureLabel(.negativeLine),
                ReceiptResultCopy.gateFailureLabel(.negativeLine),
            ])
        #expect(content.failureLines.map(\.value) == ["line 1", "line 2"])
    }

    @Test("the reason reaches the unreadable screen")
    func unreadableCarriesTheReason() {
        let result = Self.presentation.content(
            .unreadable(receiptCount: 2, reason: "the image is blank"))

        guard case .unreadable(let content) = result else {
            Issue.record("expected unreadable")
            return
        }
        #expect(content.reason.contains("the image is blank"))
        #expect(content.photoCount == ReceiptResultCopy.photoCount(2))
    }

    @Test("no photos means no photo count")
    func noPhotosMeansNoCaption() {
        let result = Self.presentation.content(.unreadable(receiptCount: 0, reason: "blank"))

        guard case .unreadable(let content) = result else {
            Issue.record("expected unreadable")
            return
        }
        #expect(content.photoCount == nil)
    }

    /// The three outcomes must never converge on the same words — the whole
    /// point of the tri-state per POPS-1961.
    @Test("the three outcomes say different things")
    func theThreeOutcomesAreDistinct() {
        let created = Self.presentation.content(
            .created(purchase: .fake(id: "p1"), alreadyStored: false))
        let needsReview = Self.presentation.content(
            .needsReview(receiptCount: 0, failures: [.fake()], extracted: .fake()))
        let unreadable = Self.presentation.content(.unreadable(receiptCount: 0, reason: "blank"))

        #expect(headings([created, needsReview, unreadable]).count == 3)
    }

    private func headings(_ contents: [ReceiptResultContent]) -> Set<String> {
        Set(
            contents.map { content in
                switch content {
                case .created(let created): return created.heading
                case .needsReview(let needsReview): return needsReview.heading
                case .unreadable(let unreadable): return unreadable.heading
                }
            })
    }
}
