import AppCore
import Foundation

/// How a ``AppCore/ReceiptOutcome`` becomes the lines the result screen
/// draws.
///
/// A field the extraction has nothing for is dropped rather than drawn as a
/// dash — the same call `TransactionDetailPresentation` makes about a missing
/// entity, for the same reason: a review screen padded out with empty labels
/// reads as a record that failed to load, and here of all places that reading
/// is actively dangerous — a reviewer comparing this against the paper needs
/// to trust that a blank line means the receipt never said, not that this
/// screen dropped something.
internal struct ReceiptResultPresentation: Sendable {
    internal func content(_ outcome: ReceiptOutcome) -> ReceiptResultContent {
        switch outcome {
        case .created(let purchase, let alreadyStored):
            return .created(created(purchase: purchase, alreadyStored: alreadyStored))
        case .needsReview(let receiptCount, let failures, let extracted):
            return .needsReview(
                needsReview(receiptCount: receiptCount, failures: failures, extracted: extracted))
        case .unreadable(let receiptCount, let reason):
            return .unreadable(unreadable(receiptCount: receiptCount, reason: reason))
        }
    }
}

extension ReceiptResultPresentation {
    private func created(purchase: ReceiptPurchase, alreadyStored: Bool)
        -> ReceiptResultContent
        .CreatedContent
    {
        ReceiptResultContent.CreatedContent(
            heading: ReceiptResultCopy.createdHeading,
            message: alreadyStored
                ? ReceiptResultCopy.createdAlreadyStoredMessage : ReceiptResultCopy.createdMessage,
            merchantName: purchase.merchantName?.ifNotEmpty,
            total: purchase.total.formatted(),
            itemCount: ReceiptResultCopy.itemCountLabel(purchase.itemCount),
            purchasedOn: purchasedOn(purchase.orderedAt),
            reference: ReceiptResultCopy.purchaseReference(purchase.id),
            summary: ReceiptResultCopy.purchaseSummary(
                merchantName: purchase.merchantName,
                itemCount: purchase.itemCount,
                total: purchase.total.formatted()
            )
        )
    }

    /// The date half of the purchase's timestamp, in the reader's own locale.
    ///
    /// Unlike the receipt's transcribed `purchasedOn`, this one IS parsed —
    /// it is a machine timestamp the purchases pillar computed, not a string
    /// somebody read off paper, so rendering it as `2026-08-13T02:15:00.000Z`
    /// would be showing the wire rather than the date. A value that will not
    /// parse is dropped rather than shown raw: this screen has already said
    /// what was recorded, and a malformed date adds nothing a reader can use.
    private func purchasedOn(_ orderedAt: String) -> String? {
        guard let date = ReceiptTimestamp.date(from: orderedAt) else { return nil }
        return ReceiptResultCopy.purchasedOn(date.formatted(date: .abbreviated, time: .omitted))
    }

    private func needsReview(
        receiptCount: Int, failures: [ReceiptGateFailure], extracted: ExtractedReceipt
    ) -> ReceiptResultContent.NeedsReviewContent {
        ReceiptResultContent.NeedsReviewContent(
            heading: ReceiptResultCopy.needsReviewHeading,
            message: ReceiptResultCopy.needsReviewMessage(for: failures.map(\.kind)),
            photoCount: photoCount(receiptCount),
            identity: identity(extracted),
            lines: lines(extracted.lines),
            total: field(ReceiptResultCopy.FieldLabel.total, extracted.total),
            adjustments: adjustments(extracted),
            notes: field(
                ReceiptResultCopy.FieldLabel.unreadableNotes, amounts(extracted.unreadableNotes)),
            failureLines: failureLines(failures)
        )
    }

    private func unreadable(receiptCount: Int, reason: String)
        -> ReceiptResultContent
        .UnreadableContent
    {
        ReceiptResultContent.UnreadableContent(
            heading: ReceiptResultCopy.unreadableHeading,
            message: ReceiptResultCopy.unreadableMessage,
            reason: ReceiptResultCopy.unreadableReason(reason),
            photoCount: photoCount(receiptCount)
        )
    }

    private func photoCount(_ receiptCount: Int) -> String? {
        receiptCount <= 0 ? nil : ReceiptResultCopy.photoCount(receiptCount)
    }

    /// Who and when, as printed at the top of the paper, dropping whatever
    /// the receipt did not state.
    private func identity(_ extracted: ExtractedReceipt) -> ReceiptResultContent.Identity {
        ReceiptResultContent.Identity(
            merchant: field(ReceiptResultCopy.FieldLabel.merchant, extracted.merchantName),
            address: field(ReceiptResultCopy.FieldLabel.address, extracted.address),
            date: field(ReceiptResultCopy.FieldLabel.date, date(extracted))
        )
    }

    /// What moves the line items to the stated total. The total itself is not
    /// here: it is the figure this group is checked *against*, and drawing it
    /// as a fourth adjustment is how a reader loses which number is which.
    private func adjustments(_ extracted: ExtractedReceipt) -> [ReceiptResultContent.Field] {
        [
            field(ReceiptResultCopy.FieldLabel.tax, extracted.tax),
            field(ReceiptResultCopy.FieldLabel.discounts, amounts(extracted.discounts)),
            field(ReceiptResultCopy.FieldLabel.surcharges, amounts(extracted.surcharges)),
            field(ReceiptResultCopy.FieldLabel.shipping, extracted.shipping),
        ]
        .compactMap { $0 }
    }

    private func date(_ extracted: ExtractedReceipt) -> String? {
        ReceiptPrintedDate.oneLine(extracted)
    }

    private func amounts(_ amounts: [String]) -> String? {
        amounts.isEmpty ? nil : amounts.joined(separator: ", ")
    }

    /// One row per printed line, in printed order.
    ///
    /// Identified by position rather than by description: a receipt can print
    /// the same item twice, and two rows sharing an identity is a row that
    /// disappears under `ForEach`.
    private func lines(_ lines: [ExtractedReceiptLine]) -> [ReceiptResultContent.LineItem] {
        lines.enumerated().map { index, line in
            ReceiptResultContent.LineItem(
                id: "line-\(index)",
                description: line.description,
                amount: line.amount,
                note: ReceiptResultCopy.lineNote(quantity: line.quantity, unitNote: line.unitNote)
            )
        }
    }

    /// A field, or nothing at all. Whitespace counts as nothing, for the same
    /// reason `TransactionDetailPresentation` treats it that way.
    private func field(_ label: String, _ value: String?) -> ReceiptResultContent.Field? {
        guard let value = value?.ifNotEmpty else { return nil }
        return ReceiptResultContent.Field(label: label, value: value)
    }

    /// One line per gate complaint, worded for a reader rather than left as
    /// the raw ``AppCore/ReceiptGateFailureKind`` case. The kind's own label
    /// is the field's key; the model's detail — and, on a sum mismatch, how
    /// far off it was — is the value, because that is what a reviewer checks
    /// against the photograph.
    private func failureLines(_ failures: [ReceiptGateFailure]) -> [ReceiptResultContent.Field] {
        failures.enumerated().map { index, failure in
            let label = ReceiptResultCopy.gateFailureLabel(failure.kind)
            var value = failure.detail
            if let deltaCents = failure.deltaCents {
                value += value.isEmpty ? "" : " — "
                value += ReceiptResultCopy.deltaCents(deltaCents)
            }
            return ReceiptResultContent.Field(
                id: "gate-failure-\(index)", label: label, value: value.ifNotEmpty ?? label)
        }
    }
}

/// The date and time the receipt printed, as one line.
///
/// Shared by the reading and the form rather than written out in each, so the
/// value a reader checks against the paper and the value they edit are the
/// same string. Two copies of this join is how a form comes to show a date the
/// screen before it did not.
///
/// Neither half is reformatted through a `DateFormatter`: both arrive in the
/// shape the receipt printed them, and re-parsing a string the model only ever
/// transcribes would risk showing something the paper never said.
internal enum ReceiptPrintedDate {
    internal static func oneLine(_ extracted: ExtractedReceipt) -> String? {
        [extracted.purchasedOn, extracted.purchasedAt]
            .compactMap { $0 }
            .joined(separator: " ")
            .ifNotEmpty
    }
}

extension String {
    fileprivate var ifNotEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// Reading the purchase timestamp the way the producer is allowed to write it.
///
/// Two formatters rather than one, because `ISO8601DateFormatter` treats
/// `.withFractionalSeconds` as a requirement rather than a permission: the one
/// that accepts `…:00.000Z` rejects `…:00Z`, and the purchases pillar's own
/// pattern admits both. Trying the strict one first and falling back is the
/// whole of it.
internal enum ReceiptTimestamp {
    /// Built per call rather than cached in a `static let`, because
    /// `ISO8601DateFormatter` is a mutable class and not `Sendable` — a shared
    /// instance is a data race the language refuses under strict concurrency.
    /// One confirmation screen reads one timestamp, so there is no scrolling
    /// list paying for it here.
    internal static func date(from value: String) -> Date? {
        formatter(fractionalSeconds: true).date(from: value)
            ?? formatter(fractionalSeconds: false).date(from: value)
    }

    private static func formatter(fractionalSeconds: Bool) -> ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions =
            fractionalSeconds
            ? [.withInternetDateTime, .withFractionalSeconds] : [.withInternetDateTime]
        return formatter
    }
}
