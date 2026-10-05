/// The reported lifecycle status of a gateway tool call.
public enum EgoToolStatus: String, Hashable, Sendable {
    case started
    case finished
    case failed
}

/// An event produced while Ego streams a response.
public enum EgoStreamEvent: Hashable, Sendable {
    case token(String)
    case tool(name: String, status: EgoToolStatus)
    case part(EgoMessagePart)
    case navigate(uri: String)
    case done(conversationId: String, messageId: String, parts: [EgoMessagePart])
    case failed(message: String, retryable: Bool)
}
