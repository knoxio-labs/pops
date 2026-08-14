import AppCore
import Testing

@testable import FeatureReceiptCapture

/// What the result screen says, per outcome — pinned as a value rather than as
/// a rendered view, so what changed is the assertion's business rather than a
/// pixel diff's.
@Suite("Receipt result presentation")
internal struct ReceiptResultPresentationTests {
    private static let presentation = ReceiptResultPresentation()

    @Test("a fresh write and a re-upload of the same bytes read differently")
    func createdDistinguishesAlreadyStored() {
        let fresh = Self.presentation.content(
            .created(purchaseId: "purchase-1", alreadyStored: false))
        let repeated = Self.presentation.content(
            .created(purchaseId: "purchase-1", alreadyStored: true))

        guard case .created(let freshContent) = fresh, case .created(let repeatedContent) = repeated
        else {
            Issue.record("expected both to present as created")
            return
        }
        #expect(freshContent.message != repeatedContent.message)
        #expect(freshContent.reference.contains("purchase-1"))
        #expect(repeatedContent.reference.contains("purchase-1"))
    }

    @Test("every field the extraction sent draws, in receipt order")
    func needsReviewDrawsEveryField() throws {
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
            .needsReview(receiptURIs: ["r1"], failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(
            content.extractedFields.map(\.label) == [
                ReceiptResultCopy.FieldLabel.merchant,
                ReceiptResultCopy.FieldLabel.address,
                ReceiptResultCopy.FieldLabel.date,
                ReceiptResultCopy.FieldLabel.total,
                ReceiptResultCopy.FieldLabel.tax,
                ReceiptResultCopy.FieldLabel.discounts,
                ReceiptResultCopy.FieldLabel.surcharges,
                ReceiptResultCopy.FieldLabel.shipping,
                ReceiptResultCopy.FieldLabel.lines,
                ReceiptResultCopy.FieldLabel.unreadableNotes,
            ])
        let lines = try #require(
            content.extractedFields.first { $0.label == ReceiptResultCopy.FieldLabel.lines })
        #expect(lines.value.contains("Milk"))
        #expect(lines.value.contains("Bread"))
    }

    /// A field the receipt never stated is dropped, not drawn as a dash — a
    /// screen a reviewer trusts cannot pad itself out with placeholders.
    @Test("a field the extraction has nothing for is not drawn")
    func absentFieldsAreDropped() {
        let extracted = ExtractedReceipt.fake(
            merchantName: nil, address: nil, purchasedOn: nil, purchasedAt: nil, tax: nil,
            discounts: [], surcharges: [], shipping: nil, lines: [], unreadableNotes: [])
        let result = Self.presentation.content(
            .needsReview(receiptURIs: [], failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(content.extractedFields.map(\.label) == [ReceiptResultCopy.FieldLabel.total])
        #expect(content.photoCount == nil)
    }

    @Test("whitespace is not a value")
    func whitespaceIsDropped() {
        let extracted = ExtractedReceipt.fake(merchantName: "   \n ")
        let result = Self.presentation.content(
            .needsReview(receiptURIs: [], failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        #expect(
            !content.extractedFields.map(\.label).contains(ReceiptResultCopy.FieldLabel.merchant))
    }

    /// A value that is *not* whitespace-only still has its surrounding
    /// whitespace trimmed — the receipt printed the padding, not the reader.
    @Test("surrounding whitespace on a real value is trimmed, not preserved")
    func surroundingWhitespaceIsTrimmed() throws {
        let extracted = ExtractedReceipt.fake(merchantName: "  Test Grocer  \n")
        let result = Self.presentation.content(
            .needsReview(receiptURIs: [], failures: [.fake()], extracted: extracted))

        guard case .needsReview(let content) = result else {
            Issue.record("expected needsReview")
            return
        }
        let merchant = try #require(
            content.extractedFields.first { $0.label == ReceiptResultCopy.FieldLabel.merchant })
        #expect(merchant.value == "Test Grocer")
    }

    @Test("a sum mismatch carries how far off it was")
    func sumMismatchCarriesTheDelta() throws {
        let failure = ReceiptGateFailure.fake(
            kind: .sumMismatch, detail: "lines vs total", deltaCents: -137)
        let result = Self.presentation.content(
            .needsReview(receiptURIs: [], failures: [failure], extracted: .fake()))

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
            .needsReview(receiptURIs: [], failures: [failure], extracted: .fake()))

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
            .needsReview(receiptURIs: [], failures: failures, extracted: .fake()))

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
            .unreadable(receiptURIs: ["r1", "r2"], reason: "the image is blank"))

        guard case .unreadable(let content) = result else {
            Issue.record("expected unreadable")
            return
        }
        #expect(content.reason.contains("the image is blank"))
        #expect(content.photoCount == ReceiptResultCopy.photoCount(2))
    }

    @Test("no photos means no photo count")
    func noPhotosMeansNoCaption() {
        let result = Self.presentation.content(.unreadable(receiptURIs: [], reason: "blank"))

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
        let created = Self.presentation.content(.created(purchaseId: "p1", alreadyStored: false))
        let needsReview = Self.presentation.content(
            .needsReview(receiptURIs: [], failures: [.fake()], extracted: .fake()))
        let unreadable = Self.presentation.content(.unreadable(receiptURIs: [], reason: "blank"))

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
