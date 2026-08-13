import AppCore

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
        case .created(let purchaseId, let alreadyStored):
            return .created(created(purchaseId: purchaseId, alreadyStored: alreadyStored))
        case .needsReview(let receiptURIs, let failures, let extracted):
            return .needsReview(
                needsReview(receiptURIs: receiptURIs, failures: failures, extracted: extracted))
        case .unreadable(let receiptURIs, let reason):
            return .unreadable(unreadable(receiptURIs: receiptURIs, reason: reason))
        }
    }
}

extension ReceiptResultPresentation {
    private func created(purchaseId: String, alreadyStored: Bool)
        -> ReceiptResultContent
        .CreatedContent
    {
        ReceiptResultContent.CreatedContent(
            heading: ReceiptResultCopy.createdHeading,
            message: alreadyStored
                ? ReceiptResultCopy.createdAlreadyStoredMessage : ReceiptResultCopy.createdMessage,
            reference: ReceiptResultCopy.purchaseReference(purchaseId),
            noDestinationNote: ReceiptResultCopy.createdNoDestination
        )
    }

    private func needsReview(
        receiptURIs: [String], failures: [ReceiptGateFailure], extracted: ExtractedReceipt
    ) -> ReceiptResultContent.NeedsReviewContent {
        ReceiptResultContent.NeedsReviewContent(
            heading: ReceiptResultCopy.needsReviewHeading,
            message: ReceiptResultCopy.needsReviewMessage,
            photoCount: photoCount(receiptURIs),
            extractedFields: fields(extracted),
            failureLines: failureLines(failures)
        )
    }

    private func unreadable(receiptURIs: [String], reason: String)
        -> ReceiptResultContent
        .UnreadableContent
    {
        ReceiptResultContent.UnreadableContent(
            heading: ReceiptResultCopy.unreadableHeading,
            message: ReceiptResultCopy.unreadableMessage,
            reason: ReceiptResultCopy.unreadableReason(reason),
            photoCount: photoCount(receiptURIs)
        )
    }

    private func photoCount(_ receiptURIs: [String]) -> String? {
        receiptURIs.isEmpty ? nil : ReceiptResultCopy.photoCount(receiptURIs.count)
    }

    /// Every field the extraction can fill in, in receipt order — merchant
    /// down to items — dropping whatever the receipt did not state.
    private func fields(_ extracted: ExtractedReceipt) -> [ReceiptResultContent.Field] {
        var fields: [ReceiptResultContent.Field] = [
            field(ReceiptResultCopy.FieldLabel.merchant, extracted.merchantName),
            field(ReceiptResultCopy.FieldLabel.address, extracted.address),
            field(ReceiptResultCopy.FieldLabel.date, date(extracted)),
            field(ReceiptResultCopy.FieldLabel.total, extracted.total),
            field(ReceiptResultCopy.FieldLabel.tax, extracted.tax),
            field(ReceiptResultCopy.FieldLabel.discounts, amounts(extracted.discounts)),
            field(ReceiptResultCopy.FieldLabel.surcharges, amounts(extracted.surcharges)),
            field(ReceiptResultCopy.FieldLabel.shipping, extracted.shipping),
        ]
        .compactMap { $0 }
        if let lines = lines(extracted.lines) {
            fields.append(
                ReceiptResultContent.Field(label: ReceiptResultCopy.FieldLabel.lines, value: lines))
        }
        if let notes = amounts(extracted.unreadableNotes) {
            fields.append(
                ReceiptResultContent.Field(
                    label: ReceiptResultCopy.FieldLabel.unreadableNotes, value: notes))
        }
        return fields
    }

    /// The date and time as one line, when the receipt states either. Neither
    /// is reformatted through a `DateFormatter` — both arrive already in the
    /// shape the receipt printed them, and re-parsing a string this model
    /// only ever transcribes would risk showing something the paper never
    /// said.
    private func date(_ extracted: ExtractedReceipt) -> String? {
        [extracted.purchasedOn, extracted.purchasedAt]
            .compactMap { $0 }
            .joined(separator: " ")
            .ifNotEmpty
    }

    private func amounts(_ amounts: [String]) -> String? {
        amounts.isEmpty ? nil : amounts.joined(separator: ", ")
    }

    private func lines(_ lines: [ExtractedReceiptLine]) -> String? {
        guard !lines.isEmpty else { return nil }
        return lines.map(line(_:)).joined(separator: "\n")
    }

    private func line(_ line: ExtractedReceiptLine) -> String {
        var text = "\(line.description) — \(line.amount)"
        if let quantity = line.quantity {
            text += " (×\(quantity))"
        }
        if let unitNote = line.unitNote {
            text += " \(unitNote)"
        }
        return text
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

extension String {
    fileprivate var ifNotEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : self
    }
}
