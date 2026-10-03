/// One tool call's lifecycle within an Ego turn.
public struct EgoToolActivity: Hashable, Identifiable, Sendable {
    /// The position of this activity in the turn's tool list.
    public let id: Int
    /// The gateway tool name.
    public let name: String
    /// The latest lifecycle status reported for this call.
    public let status: EgoToolStatus

    /// Creates one tool activity value.
    public init(id: Int, name: String, status: EgoToolStatus) {
        self.id = id
        self.name = name
        self.status = status
    }
}

/// The terminal or active phase of a streamed Ego turn.
public enum EgoTurnPhase: Hashable, Sendable {
    /// The stream is still producing events.
    case streaming
    /// The stream finished and persisted the assistant message.
    case finished(conversationId: String, messageId: String)
    /// The stream stopped with a recoverable or final failure.
    case failed(message: String, retryable: Bool)
}

/// The state accumulated while an Ego stream is being reduced.
public struct EgoTurnState: Hashable, Sendable {
    /// Text received from token events before the authoritative done event.
    public var streamedText: String
    /// Tool calls and their latest statuses in arrival order.
    public var tools: [EgoToolActivity]
    /// Message parts received during the stream.
    public var parts: [EgoMessagePart]
    /// The most recently requested navigation URI, when any.
    public var navigationTarget: String?
    /// Whether the stream is active, complete, or failed.
    public var phase: EgoTurnPhase

    /// Creates an Ego turn state value.
    public init(
        streamedText: String = "",
        tools: [EgoToolActivity] = [],
        parts: [EgoMessagePart] = [],
        navigationTarget: String? = nil,
        phase: EgoTurnPhase = .streaming
    ) {
        self.streamedText = streamedText
        self.tools = tools
        self.parts = parts
        self.navigationTarget = navigationTarget
        self.phase = phase
    }

    /// The empty state before the first stream event.
    public static let initial = EgoTurnState()
}

/// Pure state transitions for the events produced by an Ego turn stream.
public enum EgoTurnReducer {
    /// Applies one stream event and returns the resulting turn state.
    ///
    /// Events after a terminal `done` or `failed` event are ignored.
    ///
    /// - Parameters:
    ///   - state: The state accumulated so far.
    ///   - event: The next event from the stream.
    /// - Returns: A new state with the event applied.
    public static func reduce(_ state: EgoTurnState, applying event: EgoStreamEvent) -> EgoTurnState
    {
        guard case .streaming = state.phase else { return state }

        var next = state
        switch event {
        case .token(let text):
            next.streamedText.append(contentsOf: text)
        case .tool(let name, let status):
            if status == .started {
                next.tools.append(EgoToolActivity(id: next.tools.count, name: name, status: status))
            } else if let index = next.tools.lastIndex(where: {
                $0.name == name && $0.status == .started
            }) {
                next.tools[index] = EgoToolActivity(
                    id: next.tools[index].id, name: name, status: status)
            } else {
                next.tools.append(EgoToolActivity(id: next.tools.count, name: name, status: status))
            }
        case .part(let part):
            next.parts.append(part)
        case .navigate(let uri):
            next.navigationTarget = uri
        case .done(let conversationId, let messageId, let parts):
            next.streamedText = ""
            next.parts = parts
            next.phase = .finished(conversationId: conversationId, messageId: messageId)
        case .failed(let message, let retryable):
            next.phase = .failed(message: message, retryable: retryable)
        }
        return next
    }
}
