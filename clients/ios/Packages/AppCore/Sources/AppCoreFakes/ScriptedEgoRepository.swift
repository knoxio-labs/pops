import AppCore

/// One queued Ego stream, optionally followed by a failure.
public struct ScriptedEgoChatScript: Sendable {
    /// Events to yield, in order.
    public let events: [EgoStreamEvent]
    /// Failure to throw after yielding every event, when present.
    public let trailingError: (any Error)?

    /// Creates a stream script.
    public init(events: [EgoStreamEvent], trailingError: (any Error)? = nil) {
        self.events = events
        self.trailingError = trailingError
    }
}

/// A queued chat request recorded by ``ScriptedEgoRepository``.
public struct ScriptedEgoStreamChatCall: Hashable, Sendable {
    public let message: String
    public let conversationId: String?
    public let context: EgoAppContext?

    /// Creates a recorded chat request value.
    public init(message: String, conversationId: String?, context: EgoAppContext?) {
        self.message = message
        self.conversationId = conversationId
        self.context = context
    }
}

/// A conversation query recorded by ``ScriptedEgoRepository``.
public struct ScriptedEgoConversationQuery: Hashable, Sendable {
    public let limit: Int
    public let offset: Int
    public let query: String?

    /// Creates a recorded conversation query value.
    public init(limit: Int, offset: Int, query: String?) {
        self.limit = limit
        self.offset = offset
        self.query = query
    }
}

/// A batch decision recorded by ``ScriptedEgoRepository``.
public struct ScriptedEgoBatchDecision: Hashable, Sendable {
    public let id: String
    public let decision: EgoBatchDecision

    /// Creates a recorded batch decision value.
    public init(id: String, decision: EgoBatchDecision) {
        self.id = id
        self.decision = decision
    }
}

/// A conversation resume request recorded by ``ScriptedEgoRepository``.
public struct ScriptedEgoResumeChatCall: Hashable, Sendable {
    public let conversationId: String
    public let batchId: String

    /// Creates a recorded resume request value.
    public init(conversationId: String, batchId: String) {
        self.conversationId = conversationId
        self.batchId = batchId
    }
}

/// A deterministic Ego repository with scripted reads, streams, and observable calls.
public actor ScriptedEgoRepository: EgoRepository {
    private var chatScripts: [ScriptedEgoChatScript]
    private let threadRows: [String: EgoThread]
    private let conversationRows: [EgoConversation]
    private var conversationResults: [Result<[EgoConversation], RepositoryError>]
    private let conversationGate: (@Sendable () async -> Void)?
    private let configuredDecisionError: (any Error)?
    private let decideGate: (@Sendable () async -> Void)?

    /// Chat requests made, in stream creation order.
    public private(set) var streamChatCalls: [ScriptedEgoStreamChatCall] = []
    /// Conversation searches made, in call order.
    public private(set) var conversationQueries: [ScriptedEgoConversationQuery] = []
    /// Conversation identifiers read, in call order.
    public private(set) var conversationReads: [String] = []
    /// Decisions recorded, including decisions whose configured error is thrown.
    public private(set) var decisions: [ScriptedEgoBatchDecision] = []
    /// Resume requests made, in stream creation order.
    public private(set) var resumeChatCalls: [ScriptedEgoResumeChatCall] = []
    /// Method names in the order the fake received them.
    public private(set) var callLog: [String] = []

    /// Creates a fake from scripted streams, conversation results, and fixtures.
    ///
    /// `resumeChat` and `streamChat` consume the same script queue. Conversation
    /// results are consumed in order before falling back to `conversations`;
    /// their optional gate is awaited after the query has been recorded.
    /// The decision gate is awaited inside `decideBatch` before it returns.
    public init(
        chatScripts: [ScriptedEgoChatScript] = [],
        threads: [String: EgoThread] = [:],
        conversations: [EgoConversation] = [],
        conversationResults: [Result<[EgoConversation], RepositoryError>] = [],
        conversationGate: (@Sendable () async -> Void)? = nil,
        decideBatchError: (any Error)? = nil,
        decideGate: (@Sendable () async -> Void)? = nil
    ) {
        self.chatScripts = chatScripts
        self.threadRows = threads
        self.conversationRows = conversations
        self.conversationResults = conversationResults
        self.conversationGate = conversationGate
        self.configuredDecisionError = decideBatchError
        self.decideGate = decideGate
    }

    /// Starts the next scripted chat stream and records its arguments.
    nonisolated public func streamChat(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        let call = ScriptedEgoStreamChatCall(
            message: message, conversationId: conversationId, context: context)
        return makeStream { continuation in
            await self.deliverChat(call, continuation: continuation)
        }
    }

    /// Records the query and returns the configured conversation list.
    public func conversations(limit: Int, offset: Int, query: String?) async throws
        -> [EgoConversation]
    {
        conversationQueries.append(
            ScriptedEgoConversationQuery(limit: limit, offset: offset, query: query))
        callLog.append("conversations")
        let result = conversationResults.isEmpty ? nil : conversationResults.removeFirst()
        await conversationGate?()
        if let result {
            return try result.get()
        }
        return conversationRows
    }

    /// Records and returns the configured thread for an identifier.
    public func conversation(id: String) async throws -> EgoThread? {
        conversationReads.append(id)
        callLog.append("conversation")
        return threadRows[id]
    }

    /// Records a decision, waits at the optional gate, then throws its configured error.
    public func decideBatch(id: String, decision: EgoBatchDecision) async throws {
        decisions.append(ScriptedEgoBatchDecision(id: id, decision: decision))
        callLog.append("decideBatch")
        await decideGate?()
        if let configuredDecisionError {
            throw configuredDecisionError
        }
    }

    /// Starts the next scripted stream from the same queue as ``streamChat``.
    nonisolated public func resumeChat(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        let call = ScriptedEgoResumeChatCall(conversationId: conversationId, batchId: batchId)
        return makeStream { continuation in
            await self.deliverResume(call, continuation: continuation)
        }
    }

    private func deliverChat(
        _ call: ScriptedEgoStreamChatCall,
        continuation: AsyncThrowingStream<EgoStreamEvent, any Error>.Continuation
    ) {
        streamChatCalls.append(call)
        callLog.append("streamChat")
        deliverNextScript(to: continuation)
    }

    private func deliverResume(
        _ call: ScriptedEgoResumeChatCall,
        continuation: AsyncThrowingStream<EgoStreamEvent, any Error>.Continuation
    ) {
        resumeChatCalls.append(call)
        callLog.append("resumeChat")
        deliverNextScript(to: continuation)
    }

    private func deliverNextScript(
        to continuation: AsyncThrowingStream<EgoStreamEvent, any Error>.Continuation
    ) {
        let script = chatScripts.isEmpty ? nil : chatScripts.removeFirst()
        guard let script else {
            continuation.finish()
            return
        }

        for event in script.events {
            guard !Task.isCancelled else { return }
            continuation.yield(event)
        }

        if let error = script.trailingError {
            continuation.finish(throwing: error)
        } else {
            continuation.finish()
        }
    }
}

private func makeStream(
    delivering deliver:
        @escaping @Sendable (
            AsyncThrowingStream<EgoStreamEvent, any Error>.Continuation
        ) async -> Void
) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
    AsyncThrowingStream { continuation in
        let delivery = Task {
            await deliver(continuation)
        }
        continuation.onTermination = { _ in delivery.cancel() }
    }
}
