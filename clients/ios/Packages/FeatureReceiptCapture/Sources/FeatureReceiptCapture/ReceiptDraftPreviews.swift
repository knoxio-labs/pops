#if DEBUG

    import AppCore
    import SwiftUI

    // The receipt and the pages these draw come from
    // `ReceiptCapturePreviews`, so the form and the read-only reading it
    // replaces are shown against the same receipt. Two fixtures would let
    // the two screens be compared only by eye.

    private enum PreviewDraft {
        static let presentation = ReceiptDraftPresentation()

        /// A reading the gate refused, as the form the reader meets.
        static var needsReview: ReceiptDraft {
            presentation.draft(
                extracted: PreviewReceipt.extracted, failures: PreviewReceipt.failures)
        }

        /// The case this screen is really for, and the one a "correct the
        /// model" framing would have missed: the reading is right, the
        /// arithmetic balances, and the items are named the way a till prints
        /// rather than the way a person speaks.
        static var tillNames: ReceiptDraft {
            presentation.draft(
                extracted: ExtractedReceipt(
                    merchantName: "Kmart Broadway",
                    address: "1 Bay Street, Broadway NSW",
                    purchasedOn: "2026-08-20",
                    purchasedAt: "17:42",
                    currency: "AUD",
                    total: "31.00",
                    tax: nil,
                    discounts: [],
                    surcharges: [],
                    shipping: nil,
                    lines: [
                        ExtractedReceiptLine(
                            description: "ZCHEETOS C&B BALLS", amount: "4.00", quantity: nil,
                            unitNote: nil),
                        ExtractedReceiptLine(
                            description: "ZSOFT TCH BLK TRAY", amount: "12.00", quantity: nil,
                            unitNote: nil),
                        ExtractedReceiptLine(
                            description: "ZIRONING BOARD", amount: "15.00", quantity: nil,
                            unitNote: nil),
                    ],
                    unreadableNotes: []
                ),
                failures: []
            )
        }
    }

    /// A refused reading, editable. The gate's complaints sit beside the
    /// fields they name rather than in a list above them.
    #Preview("Draft — needs review") {
        ReceiptDraftView(
            draft: PreviewDraft.needsReview,
            title: ReceiptDraftCopy.title,
            subtitle: ReceiptDraftCopy.subtitle,
            status: ReceiptDraftView.Status(
                tone: .warning,
                heading: ReceiptResultCopy.needsReviewHeading,
                message: ReceiptResultCopy.needsReviewMessage(
                    for: PreviewReceipt.failures.map(\.kind)),
                caption: ReceiptResultCopy.photoCount(2)),
            parts: PreviewReceipt.pages(2),
            secondaryAction: ReceiptDraftView.SecondaryAction(
                title: ReceiptCaptureCopy.captureAnother, action: {}),
            save: { _ in }
        )
    }

    /// Nothing is wrong with this reading. It balanced, and the reader is
    /// here to make the names say what the things are.
    #Preview("Draft — a clean read worth improving") {
        ReceiptDraftView(
            draft: PreviewDraft.tillNames,
            title: ReceiptDraftCopy.title,
            subtitle: ReceiptDraftCopy.subtitle,
            status: ReceiptDraftView.Status(
                tone: .success,
                heading: ReceiptResultCopy.createdHeading,
                message: ReceiptResultCopy.createdMessage),
            parts: PreviewReceipt.pages(1),
            secondaryAction: ReceiptDraftView.SecondaryAction(
                title: ReceiptCaptureCopy.captureAnother, action: {}),
            save: { _ in }
        )
    }

    /// The same form with nothing read into it and no paper above it — the
    /// hand-entered purchase, so the two can be compared side by side and
    /// stay one screen.
    #Preview("Draft — nothing pre-filled") {
        ReceiptDraftView(
            draft: PreviewDraft.presentation.blankDraft(currency: "AUD"),
            title: ReceiptDraftCopy.manualTitle,
            subtitle: ReceiptDraftCopy.manualSubtitle,
            save: { _ in }
        )
    }

    /// The size the form has to survive. Every row stacks, and the bar with
    /// Save in it does not scroll away.
    #Preview("Draft — accessibility text size") {
        ReceiptDraftView(
            draft: PreviewDraft.needsReview,
            title: ReceiptDraftCopy.title,
            subtitle: ReceiptDraftCopy.subtitle,
            parts: PreviewReceipt.pages(1),
            secondaryAction: ReceiptDraftView.SecondaryAction(
                title: ReceiptCaptureCopy.captureAnother, action: {}),
            save: { _ in }
        )
        .dynamicTypeSize(.accessibility5)
    }

#endif
