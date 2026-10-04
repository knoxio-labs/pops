import AppCore
import Foundation

/// Copy and date formatting for one row in the Ego conversation list.
internal enum EgoConversationListPresentation {
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
}
