import AppCore
import FeatureReceiptCapture
import SwiftUI

/// The review step: what was read, checked one purchase at a time before any
/// of it is written.
///
/// Its own file rather than a third section of ``PurchaseCaptureSurfaces``,
/// which had outgrown what a reader can hold — and the split falls where the
/// flow does, since this is the only step of the four that touches a form.
@MainActor
internal enum PurchaseReviewSurfaces {
    private static let drafts = ReceiptDraftPresentation()

    private static func entry(
        _ id: String,
        extracted: ExtractedReceipt? = nil,
        failures: [ReceiptGateFailure] = [],
        status: ReceiptDraftView.Status? = nil,
        pages: Int = 1
    ) -> ReviewEntry {
        ReviewEntry(
            id: id,
            draft: extracted.map { drafts.draft(extracted: $0, failures: failures) }
                ?? drafts.blankDraft(currency: Fixtures.aud),
            wasUnreadable: extracted == nil,
            status: status,
            parts: ReceiptPlaygroundPaper.pages(pages)
        )
    }

    /// The banner an entry carries when the gate found something. A reading
    /// that failed its own total check is still handed over to be corrected —
    /// the complaint names a field and becomes a hint beside it, never a lock.
    internal static let needsReview = ReceiptDraftView.Status(
        tone: .warning,
        heading: "Needs review",
        message: "Some of what came back does not check out."
    )

    internal static let review = DesignSurface(
        id: SurfaceID(area: "purchases", slug: "review"),
        title: "Review",
        synopsis: "Checking what was read, one purchase at a time, before any of it is saved.",
        chrome: .navigation,
        states: [
            DesignState.standard {
                PurchaseReviewSurface(entries: [
                    entry("e1", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted),
                    entry("e2", extracted: ReceiptPlaygroundFixtures.typicalExtracted, pages: 3),
                    entry("e3", extracted: ReceiptPlaygroundFixtures.hardwareExtracted),
                ])
            },
            // The order the batch actually arrives in: what could not be read
            // is first and says so, because it needs every field typed and
            // last is where somebody has least patience for that.
            DesignState("unreadable-first", "One could not be read") {
                PurchaseReviewSurface(entries: [
                    entry("e0"),
                    entry("e1", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted),
                    entry("e2", extracted: ReceiptPlaygroundFixtures.typicalExtracted),
                ])
            },
            DesignState("needs-review", "A reading the gate complained about") {
                PurchaseReviewSurface(entries: [
                    entry(
                        "e1",
                        extracted: ReceiptPlaygroundFixtures.hardwareExtracted,
                        failures: ReceiptPlaygroundFixtures.hardwareFailures,
                        status: needsReview),
                    entry("e2", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted),
                ])
            },
            // Every adjustment stated, so the four included-toggles are all
            // on screen. Tax opens included because GST is inside a marked
            // price here; the rest do not.
            DesignState("adjustments", "Every adjustment, with its basis") {
                PurchaseReviewSurface(entries: [
                    entry("e1", extracted: ReceiptPlaygroundFixtures.typicalExtracted)
                ])
            },
            // A merchant with no address on file, which is what makes the
            // address picker fall back to a field rather than offer an empty
            // list.
            DesignState("no-addresses", "A merchant with no branch on file") {
                PurchaseReviewSurface(
                    entries: [entry("e1", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted)],
                    merchants: [PurchaseMerchantFixtures.all[3]])
            },
            // No catalogue at all — a device that cannot reach contacts. Both
            // fields are plain text, which is what this form did before
            // pickers and what it must still do.
            DesignState("no-catalogue", "Nothing to pick from") {
                PurchaseReviewSurface(
                    entries: [entry("e1", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted)],
                    merchants: [])
            },
            DesignState("single", "One purchase") {
                PurchaseReviewSurface(entries: [
                    entry("e1", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted, pages: 2)
                ])
            },
            // A reading with no lines at all, which is a different emptiness
            // from one nobody could read: the paper was legible and said
            // nothing itemised.
            DesignState("no-lines", "A reading with no line items") {
                PurchaseReviewSurface(entries: [
                    entry(
                        "e1",
                        extracted: ReceiptPlaygroundFixtures.noLinesExtracted,
                        failures: ReceiptPlaygroundFixtures.noLinesFailures,
                        status: needsReview)
                ])
            },
        ]
    )

    /// A batch whose first reading the gate complained about, and a clean one
    /// behind it — the shape the `review-complaint-density` experiment is
    /// argued over. Both variants get the same two, because a complaint shown
    /// against different receipts is not a comparison.
    internal static let complaintEntries: [ReviewEntry] = [
        entry(
            "e1",
            extracted: ReceiptPlaygroundFixtures.hardwareExtracted,
            failures: ReceiptPlaygroundFixtures.hardwareFailures,
            status: needsReview),
        entry("e2", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted),
    ]
}
