import AppCore
import Foundation

/// A fixed answer for one staged Ego transcript read.
internal enum PlaygroundEgoThreadOutcome: Sendable {
    case thread(EgoThread?)
    case failure(RepositoryError)
}

/// A fixed answer for a chat or resumed-chat stream.
internal enum PlaygroundEgoStreamOutcome: Sendable {
    case events([EgoStreamEvent])
    case eventsThenStall([EgoStreamEvent])
    case stalls
    case failure(RepositoryError)
}

/// A fixed answer for a batch decision.
internal enum PlaygroundEgoDecisionOutcome: Sendable {
    case succeeds
    case fails(RepositoryError)
}

/// An `EgoRepository` made only of fixture values. It has no transport and
/// cannot reach the phone's real credentials or a service.
internal struct PlaygroundEgoRepository: EgoRepository {
    private let conversationRows: Result<[EgoConversation], RepositoryError>
    private let threads: [String: PlaygroundEgoThreadOutcome]
    private let chat: PlaygroundEgoStreamOutcome
    private let resume: PlaygroundEgoStreamOutcome
    private let decision: PlaygroundEgoDecisionOutcome

    internal init(
        conversations: Result<[EgoConversation], RepositoryError> = .success([]),
        threads: [String: PlaygroundEgoThreadOutcome] = [:],
        chat: PlaygroundEgoStreamOutcome = .events([]),
        resume: PlaygroundEgoStreamOutcome = .events([]),
        decision: PlaygroundEgoDecisionOutcome = .succeeds
    ) {
        conversationRows = conversations
        self.threads = threads
        self.chat = chat
        self.resume = resume
        self.decision = decision
    }

    internal func streamChat(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        stream(for: chat)
    }

    internal func conversations(
        limit: Int,
        offset: Int,
        query: String?
    ) async throws -> [EgoConversation] {
        let rows = try conversationRows.get()
        let matchingRows: [EgoConversation]
        if let query, !query.isEmpty {
            matchingRows = rows.filter { $0.title?.localizedCaseInsensitiveContains(query) == true }
        } else {
            matchingRows = rows
        }
        return Array(matchingRows.dropFirst(offset).prefix(limit))
    }

    internal func conversation(id: String) async throws -> EgoThread? {
        guard let outcome = threads[id] else { return nil }
        return switch outcome {
        case .thread(let thread): thread
        case .failure(let error): throw error
        }
    }

    internal func decideBatch(id: String, decision: EgoBatchDecision) async throws {
        switch self.decision {
        case .succeeds: return
        case .fails(let error): throw error
        }
    }

    internal func resumeChat(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        stream(for: resume)
    }

    private func stream(
        for outcome: PlaygroundEgoStreamOutcome
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let events: [EgoStreamEvent]
                    let shouldStall: Bool
                    switch outcome {
                    case .events(let fixedEvents):
                        events = fixedEvents
                        shouldStall = false
                    case .eventsThenStall(let fixedEvents):
                        events = fixedEvents
                        shouldStall = true
                    case .stalls:
                        events = []
                        shouldStall = true
                    case .failure(let error):
                        continuation.finish(throwing: error)
                        return
                    }

                    for event in events {
                        try Task.checkCancellation()
                        continuation.yield(event)
                        await Task.yield()
                    }
                    if shouldStall {
                        try await Task.sleep(for: .seconds(3_600))
                    }
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { @Sendable _ in task.cancel() }
        }
    }
}
