import AppCore

/// Reading the purchase date and time the way a receipt prints them: on one
/// line, together.
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
