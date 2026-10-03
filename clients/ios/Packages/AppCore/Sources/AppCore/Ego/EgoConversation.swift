import Foundation

/// Stable metadata for one Ego conversation.
public struct EgoConversation: Hashable, Identifiable, Sendable {
    public let id: String
    public let title: String?
    public let createdAt: Date
    public let updatedAt: Date

    public init(id: String, title: String?, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

/// The author role for an Ego message.
public enum EgoRole: String, Hashable, Sendable {
    case user
    case assistant
}

/// A message in an Ego conversation.
public struct EgoMessage: Hashable, Identifiable, Sendable {
    public let id: String
    public let role: EgoRole
    public let parts: [EgoMessagePart]
    public let createdAt: Date

    /// Text parts joined in order, excluding entity and action parts.
    public var plainText: String {
        parts.compactMap { part -> String? in
            guard case .text(let text) = part else { return nil }
            return text
        }
        .joined(separator: "\n")
    }

    public init(id: String, role: EgoRole, parts: [EgoMessagePart], createdAt: Date) {
        self.id = id
        self.role = role
        self.parts = parts
        self.createdAt = createdAt
    }
}

/// A conversation and its ordered message history.
public struct EgoThread: Hashable, Sendable {
    public let conversation: EgoConversation
    public let messages: [EgoMessage]

    public init(conversation: EgoConversation, messages: [EgoMessage]) {
        self.conversation = conversation
        self.messages = messages
    }
}
