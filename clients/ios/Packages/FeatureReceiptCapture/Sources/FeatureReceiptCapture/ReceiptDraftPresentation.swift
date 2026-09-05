import AppCore
import Foundation

/// How a reading becomes a form somebody can change.
///
/// The counterpart of ``ReceiptResultPresentation``, and deliberately not the
/// same function. That one drops what the receipt never stated, because a
/// display padded with empty labels reads as a record that failed to load.
/// This one keeps every field, because an empty field is where the reader
/// puts what the paper could not say — and the two most common reasons to
/// open this screen are a receipt whose items are named unhelpfully and one
/// whose items are not named at all.
public struct ReceiptDraftPresentation: Sendable {
    public init() {}

    /// A form pre-filled from what the model read, with the gate's complaints
    /// attached to the fields they name.
    public func draft(extracted: ExtractedReceipt, failures: [ReceiptGateFailure]) -> ReceiptDraft {
        let attached = hints(failures)
        return ReceiptDraft(
            merchant: ReceiptDraftValue(extracted: extracted.merchantName),
            address: ReceiptDraftValue(extracted: extracted.address),
            date: ReceiptDraftValue(extracted: ReceiptPrintedDate.oneLine(extracted)),
            lines: lines(extracted.lines),
            adjustments: adjustments(extracted),
            total: ReceiptDraftValue(extracted: extracted.total),
            currency: extracted.currency,
            hints: attached.byField,
            unattachedHints: attached.unattached,
            readingReconciled: !failures.contains { $0.kind == .sumMismatch },
            reconciliationDetail: reconciliationDetail(failures)
        )
    }

    /// A form with nothing in it, for a purchase with no receipt to
    /// photograph. Every field is the same field, in the same order, at the
    /// same weight — a hand-entered purchase and a corrected reading are the
    /// same object arrived at two ways, and two forms is how they drift.
    ///
    /// One blank line rather than none: a purchase with no items is possible
    /// and an empty items section with nothing in it to type into is a
    /// section the reader has to discover an "Add" control for.
    public func blankDraft(currency: String?) -> ReceiptDraft {
        ReceiptDraft(
            merchant: ReceiptDraftValue(extracted: nil),
            address: ReceiptDraftValue(extracted: nil),
            date: ReceiptDraftValue(extracted: nil),
            lines: [.blank(id: "line-0")],
            adjustments: [],
            total: ReceiptDraftValue(extracted: nil),
            currency: currency
        )
    }
}

extension ReceiptDraftPresentation {
    /// One row per printed line, in printed order, identified by position —
    /// a receipt can print the same item twice, and two rows sharing an
    /// identity is a row that disappears under `ForEach`.
    private func lines(_ lines: [ExtractedReceiptLine]) -> [ReceiptDraftLine] {
        lines.enumerated().map { index, line in
            ReceiptDraftLine(
                id: "line-\(index)",
                description: ReceiptDraftValue(extracted: line.description),
                amount: ReceiptDraftValue(extracted: line.amount),
                quantity: ReceiptDraftValue(extracted: line.quantity.map(String.init)),
                unitNote: ReceiptDraftValue(extracted: line.unitNote)
            )
        }
    }

    /// One row per stated adjustment, and none for the ones the receipt did
    /// not state.
    ///
    /// This is the one place the form does drop what was not read, and the
    /// reason is that an adjustment is not a fact about the purchase the way
    /// a merchant is: four permanently-present rows reading Tax, Discounts,
    /// Surcharges and Shipping, all empty, is a form telling the reader they
    /// have four things to fill in when they have none. Discounts and
    /// surcharges are lists, so a receipt with two discounts gets two rows.
    private func adjustments(_ extracted: ExtractedReceipt) -> [ReceiptDraftAdjustment] {
        var adjustments: [ReceiptDraftAdjustment] = []
        if let tax = extracted.tax {
            adjustments.append(
                ReceiptDraftAdjustment(
                    id: "tax", kind: .tax, amount: ReceiptDraftValue(extracted: tax)))
        }
        adjustments += extracted.discounts.enumerated().map { index, discount in
            ReceiptDraftAdjustment(
                id: "discount-\(index)", kind: .discount,
                amount: ReceiptDraftValue(extracted: discount))
        }
        adjustments += extracted.surcharges.enumerated().map { index, surcharge in
            ReceiptDraftAdjustment(
                id: "surcharge-\(index)", kind: .surcharge,
                amount: ReceiptDraftValue(extracted: surcharge))
        }
        if let shipping = extracted.shipping {
            adjustments.append(
                ReceiptDraftAdjustment(
                    id: "shipping", kind: .shipping,
                    amount: ReceiptDraftValue(extracted: shipping)))
        }
        return adjustments
    }

    /// Each complaint against the field it is about.
    ///
    /// A kind that names no single field stays unattached rather than being
    /// pinned to the nearest one: a receipt read as damaged is a statement
    /// about the paper, and hanging it off the merchant line would send the
    /// reader to check a merchant name that is fine.
    private func hints(_ failures: [ReceiptGateFailure]) -> (
        byField: [ReceiptDraftField: [String]], unattached: [String]
    ) {
        var byField: [ReceiptDraftField: [String]] = [:]
        var unattached: [String] = []
        for failure in failures {
            let text = wording(failure)
            if let field = Self.field(for: failure.kind) {
                byField[field, default: []].append(text)
            } else {
                unattached.append(text)
            }
        }
        return (byField, unattached)
    }

    /// The gate's own detail where it has one, because that is what points at
    /// the thing to look at. The kind's reader-facing label where it does
    /// not — never the raw wire code.
    private func wording(_ failure: ReceiptGateFailure) -> String {
        let label = ReceiptResultCopy.gateFailureLabel(failure.kind)
        let detail = failure.detail.trimmingCharacters(in: .whitespacesAndNewlines)
        return detail.isEmpty ? label : detail
    }

    private static func field(for kind: ReceiptGateFailureKind) -> ReceiptDraftField? {
        switch kind {
        case .unreadableTotal, .sumMismatch: .total
        case .unreadableLine, .noLines, .negativeLine: .lines
        case .ambiguousTax: .adjustments
        case .damaged, .unrecognised: nil
        }
    }

    /// How far the reading was out, in the gate's own terms, when it said.
    private func reconciliationDetail(_ failures: [ReceiptGateFailure]) -> String? {
        guard let mismatch = failures.first(where: { $0.kind == .sumMismatch }) else { return nil }
        guard let deltaCents = mismatch.deltaCents else { return nil }
        return ReceiptResultCopy.deltaCents(deltaCents)
    }
}
