import AppCore
import Foundation

/// Copy and date formatting for one row in the Ego conversation list.
internal enum EgoConversationListPresentation {
    internal static func failureMessage(for error: RepositoryError) -> String {
        return switch error {
        case .unavailable:
            "Ego is unavailable. Try again."
        case .unauthorized:
            "Your session needs attention before Ego can continue."
        case .rateLimited(let retryAfterSeconds):
            "Too many requests. Wait \(waitDuration(retryAfterSeconds)) before trying again."
        case .contractMismatch:
            "Ego returned a response this app can’t read."
        case .requestRejected:
            "This version of Pops sent a request the server cannot accept. Update the app."
        case .conflict:
            "This conversation changed. Reload it before trying again."
        case .transport:
            "Ego couldn’t complete the request. Try again."
        case .dependencyNotBound:
            "Ego isn’t available in this app."
        }
    }

    /// Keeps list recovery actions aligned with the shared repository failure policy.
    internal static func failureIsRetryable(for error: RepositoryError) -> Bool {
        EgoThreadModelFailurePresentation.failureCopy(for: error).retryable
    }

    internal static func title(for conversation: EgoConversation) -> String {
        guard let title = conversation.title,
            !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return "New conversation"
        }
        return title
    }

    internal static func subtitle(for conversation: EgoConversation, now: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.dateTimeStyle = .named
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: min(conversation.updatedAt, now), relativeTo: now)
    }

    private static func waitDuration(_ retryAfterSeconds: Int?) -> String {
        guard let retryAfterSeconds else { return "a minute" }
        let seconds = max(1, retryAfterSeconds)
        let unit = seconds == 1 ? "second" : "seconds"
        return "\(seconds) \(unit)"
    }
}
