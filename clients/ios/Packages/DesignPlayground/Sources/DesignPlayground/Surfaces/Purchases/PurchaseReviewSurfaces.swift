import AppCore
import FeatureReceiptCapture

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
        pages: Int = 1,
        matched: String? = nil
    ) -> ReviewEntry {
        // `matched` is what the server resolved at ingest, arriving with the
        // reading rather than being set afterwards — a proposal until
        // somebody looks at it.
        let draft =
            extracted.map {
                drafts.draft(extracted: $0, failures: failures, matchedMerchantID: matched)
            } ?? drafts.blankDraft(currency: Fixtures.aud)
        return ReviewEntry(
            id: id,
            draft: draft,
            origin: extracted == nil ? .unreadable : .read,
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

    /// A purchase typed by hand: what the capture menu's `Enter it by hand`
    /// opens. The same form as every other entry, with nothing in it.
    internal static let typed = ReviewEntry(
        id: "typed",
        draft: drafts.blankDraft(currency: Fixtures.aud),
        origin: .typed,
        status: nil,
        parts: []
    )

    /// The standard three, for the states about what pressing Save does to a
    /// batch rather than about the batch.
    private static let batch: [ReviewEntry] = [
        entry("e1", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted),
        entry("e2", extracted: ReceiptPlaygroundFixtures.typicalExtracted, pages: 3),
        entry("e3", extracted: ReceiptPlaygroundFixtures.hardwareExtracted),
    ]

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
            // The server matched the merchant at ingest. The mark is hollow
            // because nobody has looked at it yet — a match is a proposal,
            // and drawing it the same as a pick would collect agreement
            // nobody gave.
            DesignState("matched", "The server matched the merchant") {
                PurchaseReviewSurface(entries: [
                    entry(
                        "e1", extracted: ReceiptPlaygroundFixtures.tillNamesExtracted,
                        matched: "ent-kmart")
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
            // No pages above it, no sentence, and not one red rule: nothing is
            // missing from a form nobody has started. The merchant and total
            // are named once something has been typed.
            DesignState("typed", "Entered by hand") {
                PurchaseReviewSurface(entries: [typed])
            },
            // Everything held still, and the button that was pressed saying
            // how far it has got instead of being pressable again.
            DesignState("saving", "Saving, one of three done") {
                PurchaseReviewSurface(entries: batch, saving: .saving(done: 1))
            },
            // Two written and gone from the batch; the third refused by
            // something a retry can get past.
            DesignState("save-failed-partway", "Two saved, the third refused") {
                PurchaseReviewSurface(
                    entries: batch,
                    saving: .failed(
                        id: "e3", reason: "The purchases service didn't answer.", retryable: true),
                    written: 2)
            },
            DesignState("save-failed-offline", "Nothing saved, no connection") {
                PurchaseReviewSurface(
                    entries: batch,
                    saving: .failed(
                        id: "e1", reason: "No connection, so nothing was saved.", retryable: true))
            },
            // The refusal a retry cannot get past: the checksum says this
            // paper is already a purchase. Save holds until it is discarded,
            // and the banner is what explains the held button.
            DesignState("save-duplicate", "One is already a purchase") {
                PurchaseReviewSurface(
                    entries: batch,
                    saving: .failed(
                        id: "e2",
                        reason: "This receipt is already a purchase. Discard it to save the rest.",
                        retryable: false),
                    written: 1)
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
