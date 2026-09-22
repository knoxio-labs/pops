import AppCore

/// How a purchase entered review after receipt reading finished.
public enum ReviewOrigin: Hashable, Sendable {
    /// The receipt produced an editable reading.
    case read
    /// The receipt could not be read, so review starts with a blank draft.
    case unreadable
}

/// One completed receipt reading prepared for purchase review.
public struct ReviewEntry: Identifiable, Sendable {
    /// The staged receipt identity retained through reading and review.
    public let id: String
    /// The editable purchase draft shown during review.
    public let draft: ReceiptDraft
    /// Whether the draft came from a reading or starts blank.
    public let origin: ReviewOrigin
    /// The original reading needed when saving a read receipt.
    public let reading: ReceiptDraftReading?
    /// A warning shown when the reading needs review, otherwise `nil`.
    public let status: ReceiptDraftView.Status?
    /// The receipt parts retained for comparison while editing.
    public let parts: [ReceiptPart]

    /// Creates one review entry from its prepared draft and receipt context.
    public init(
        id: String,
        draft: ReceiptDraft,
        origin: ReviewOrigin,
        reading: ReceiptDraftReading?,
        status: ReceiptDraftView.Status?,
        parts: [ReceiptPart]
    ) {
        self.id = id
        self.draft = draft
        self.origin = origin
        self.reading = reading
        self.status = status
        self.parts = parts
    }

    /// Converts settled reading rows into review entries, with unreadable receipts first.
    ///
    /// Relative order is preserved within unreadable and read entries. A server-matched merchant
    /// remains a proposal in the draft rather than becoming a reader choice. Passing a queued or
    /// in-flight row is a programmer error because review can begin only after reading finishes.
    public static func batch(
        from rows: [PurchaseReadingRow],
        presentation: ReceiptDraftPresentation = ReceiptDraftPresentation()
    ) -> [ReviewEntry] {
        var unreadable: [ReviewEntry] = []
        var read: [ReviewEntry] = []

        for row in rows {
            switch row.outcome {
            case .read(let reading):
                read.append(
                    ReviewEntry(
                        id: row.id,
                        draft: presentation.draft(
                            extracted: reading.extracted,
                            failures: reading.failures,
                            matchedMerchantID: reading.matchedMerchantEntityID),
                        origin: .read,
                        reading: reading,
                        status: reading.reconciled
                            ? nil
                            : ReceiptDraftView.Status(
                                tone: .warning,
                                heading: PurchaseReviewCopy.needsReviewHeading,
                                message: PurchaseReviewCopy.needsReviewMessage),
                        parts: row.parts
                    ))
            case .unreadable:
                unreadable.append(
                    ReviewEntry(
                        id: row.id,
                        draft: presentation.blankDraft(currency: nil),
                        origin: .unreadable,
                        reading: nil,
                        status: nil,
                        parts: row.parts
                    ))
            case .queued, .reading:
                preconditionFailure("Review entries require settled reading rows")
            }
        }

        return unreadable + read
    }
}
