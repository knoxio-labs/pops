import AppCore
import DesignSystem
import SwiftUI

internal struct TripDocumentFailureView: View {
    internal let failure: any Error
    internal let retry: () -> Void

    internal var body: some View {
        if canRetry {
            ErrorStateView(message: message, retryTitle: "Try Again", retry: retry)
        } else {
            NonRetryableErrorStateView(message: message)
        }
    }

    private var canRetry: Bool {
        if failure is DocumentAccessError { return false }
        if let error = failure as? RepositoryError { return TripsFailureView.canRetry(error) }
        return true
    }

    private var message: String {
        if let error = failure as? DocumentAccessError {
            return error == .notConfigured
                ? "Documents is not connected to Paperless." : "Document unavailable."
        }
        switch failure as? RepositoryError {
        case .featureUnavailable: return "This device does not have access to Documents."
        case .unauthorized: return "Your session has ended."
        case .dependencyNotBound: return "Documents is not connected in this app."
        case .contractMismatch, .requestRejected:
            return "This app cannot read the document service response."
        case .rateLimited(let seconds):
            return seconds.map { "Documents asked you to wait \($0) seconds." }
                ?? "Documents asked you to wait."
        default: return "Document could not be loaded."
        }
    }
}
