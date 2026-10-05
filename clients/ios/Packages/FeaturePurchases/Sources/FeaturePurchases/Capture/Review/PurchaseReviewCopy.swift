import AppCore

internal enum PurchaseReviewCopy {
    internal static let needsReviewHeading = "Needs review"
    internal static let needsReviewMessage = "Some of what came back does not check out."
    internal static let unreadableSubtitle = "Nothing could be read off this one."

    internal static func saveFailure(_ error: RepositoryError) -> String {
        switch error {
        case .conflict:
            "This receipt is already a purchase. Discard it to save the rest."
        case .unavailable:
            "The purchases service didn't answer."
        case .rateLimited:
            "Too many requests. Wait before trying again."
        case .requestRejected:
            "This version of Pops can't save this purchase. Update the app."
        case .transport:
            "No connection, so nothing was saved."
        case .unauthorized, .featureUnavailable, .contractMismatch, .dependencyNotBound:
            ReceiptResultCopy.message(for: error)
        }
    }
}
