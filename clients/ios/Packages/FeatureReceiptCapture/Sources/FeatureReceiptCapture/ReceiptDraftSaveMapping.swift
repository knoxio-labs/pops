import AppCore
import Foundation

/// Turning an edited ``ReceiptDraft`` into the cents-based payload the BFM
/// saves (POPS-2454).
///
/// `ReceiptDraft`'s fields are `internal` — nothing outside this module can
/// read one apart, which is why this mapping lives here rather than in
/// ``ReceiptResultViewModel`` alongside the call it feeds: the parsing has
/// to happen on this side of the module boundary regardless of which type
/// does it.
///
/// Every amount is a `String` a reader has been typing into, so this can
/// fail — a stray letter, a second decimal point — in a way the form's own
/// ``ReceiptDraft/isSaveable`` does not catch (that only checks a field is
/// non-empty, not that it parses). ``ReceiptDraftSaveError`` is what a save
/// site turns into a message rather than sending a purchase with an
/// invented figure in it.
internal enum ReceiptDraftSaveError: Error, Hashable, Sendable {
    case unparseableAmount
    case unparseableDate
}

extension ReceiptDraft {
    /// A receipt-derived save, carrying the reading's own receipt URIs and
    /// capture facts forward unedited.
    internal func toSavePayload(
        reading: ReceiptDraftReading, idempotencyKey: String
    ) throws -> ReceiptDraftSavePayload {
        ReceiptDraftSavePayload(
            fields: try purchaseFields(idempotencyKey: idempotencyKey, capture: reading.capture),
            documents: reading.receiptUris.map { ReceiptSaveDocument(documentUri: $0) }
        )
    }

    /// A purchase typed by hand — no reading behind it, so no capture facts
    /// either.
    internal func toManualPayload(idempotencyKey: String) throws -> ReceiptManualPurchasePayload {
        ReceiptManualPurchasePayload(
            fields: try purchaseFields(idempotencyKey: idempotencyKey, capture: nil))
    }

    private func purchaseFields(
        idempotencyKey: String, capture: ReceiptCaptureFacts?
    ) throws -> ReceiptPurchaseDraftFields {
        guard let totalCents = ReceiptMoneyText.cents(from: total.value) else {
            throw ReceiptDraftSaveError.unparseableAmount
        }
        guard let orderedAt = Self.orderedAt(from: date.value, capture: capture) else {
            throw ReceiptDraftSaveError.unparseableDate
        }
        let items = try lines.filter { !$0.isBlank }.map(saveLine(from:))
        let adjustmentCents = try adjustmentTotals()

        return ReceiptPurchaseDraftFields(
            merchantName: merchant.isEmpty ? nil : merchant.value,
            orderedAt: orderedAt,
            currency: currency ?? "AUD",
            totalCents: totalCents,
            taxCents: adjustmentCents.tax,
            surchargeCents: adjustmentCents.surcharge,
            shippingCents: adjustmentCents.shipping,
            discountCents: adjustmentCents.discount,
            items: items,
            capture: capture,
            idempotencyKey: idempotencyKey
        )
    }

    private func saveLine(from line: ReceiptDraftLine) throws -> ReceiptSaveLine {
        guard let lineTotalCents = ReceiptMoneyText.cents(from: line.amount.value) else {
            throw ReceiptDraftSaveError.unparseableAmount
        }
        let quantity = Int(line.quantity.value.trimmingCharacters(in: .whitespaces))
        return ReceiptSaveLine(
            name: line.description.value,
            quantity: quantity,
            unitPriceCents: quantity.map { $0 > 0 ? lineTotalCents / $0 : lineTotalCents }
                ?? lineTotalCents,
            lineTotalCents: lineTotalCents,
            notes: line.unitNote.isEmpty ? [] : [line.unitNote.value]
        )
    }

    private struct AdjustmentTotals {
        var tax = 0
        var discount = 0
        var surcharge = 0
        var shipping = 0
    }

    /// Every adjustment row, summed per kind — the BFM carries one figure per
    /// kind, and a receipt printing two discounts states one discount total
    /// either way.
    private func adjustmentTotals() throws -> AdjustmentTotals {
        var totals = AdjustmentTotals()
        for adjustment in adjustments where !adjustment.amount.isEmpty {
            guard let cents = ReceiptMoneyText.cents(from: adjustment.amount.value) else {
                throw ReceiptDraftSaveError.unparseableAmount
            }
            switch adjustment.kind {
            case .tax: totals.tax += cents
            case .discount: totals.discount += cents
            case .surcharge: totals.surcharge += cents
            case .shipping: totals.shipping += cents
            }
        }
        return totals
    }

    /// The draft's printed-looking `date` field — `YYYY-MM-DD`, optionally
    /// followed by `HH:MM` (``ReceiptPrintedDate/oneLine(_:)``'s own shape) —
    /// back into an ISO-8601 instant with an offset, which is what the BFM's
    /// `orderedAt` requires.
    ///
    /// The offset comes from ``ReceiptCaptureFacts``, not from the text: the
    /// field carries a wall-clock reading, not a timezone, and the offset the
    /// receipt was resolved under is exactly what turns "5pm" into one
    /// instant rather than a guess. A capture with no offset at all — a
    /// manual entry, or a reading with no client evidence — falls back to
    /// UTC, matching what the BFM's own resolver does when nothing else
    /// states one.
    private static func orderedAt(from text: String, capture: ReceiptCaptureFacts?) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            let match = trimmed.range(
                of: #"^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$"#, options: .regularExpression)
        else {
            return nil
        }
        let matched = String(trimmed[match])
        let pieces = matched.split(separator: " ", maxSplits: 1)
        let datePart = String(pieces[0])
        let timePart = pieces.count > 1 ? String(pieces[1]) : "00:00"

        let offsetMinutes = capture?.utcOffsetMinutes ?? 0
        let offsetSign = offsetMinutes < 0 ? "-" : "+"
        let offsetMagnitude = abs(offsetMinutes)
        let offsetText = String(
            format: "%@%02d:%02d", offsetSign, offsetMagnitude / 60, offsetMagnitude % 60)

        return "\(datePart)T\(timePart):00\(offsetText)"
    }
}
