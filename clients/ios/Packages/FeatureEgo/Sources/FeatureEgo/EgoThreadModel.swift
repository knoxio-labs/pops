import AppCore
import Foundation
import Observation

/// The transcript and in-flight turn for one Ego conversation.
@MainActor
@Observable
public final class EgoThreadModel {
    /// Messages loaded from the conversation and appended during this session.
    public private(set) var messages: [EgoMessage] = []
    /// State accumulated for the current streamed turn, when one is active or failed.
    public private(set) var turn: EgoTurnState?
    /// The conversation being continued, or `nil` until the first turn completes.
    public private(set) var conversationId: String?
    /// The message the user is preparing to send.
    public var draft = ""
    /// The latest failure while reading the transcript.
    public private(set) var loadFailure: RepositoryError?
    /// A pending navigation request from the current or most recent turn.
    public private(set) var navigationTarget: String?

    @ObservationIgnored private let repository: any EgoRepository
    @ObservationIgnored private let context: @MainActor () -> EgoAppContext?
    @ObservationIgnored private let now: @Sendable () -> Date
    @ObservationIgnored private var streamTask: Task<Void, Never>?
    @ObservationIgnored private var activeStreamID: UUID?

    /// Creates a thread model backed by an Ego repository.
    ///
    /// - Parameters:
    ///   - repository: The seam for conversation reads and streamed turns.
    ///   - context: The screen context to capture when a message is sent.
    ///   - conversationId: An existing conversation to load or continue.
    ///   - now: The clock used for locally created messages.
    public init(
        repository: any EgoRepository,
        context: @escaping @MainActor () -> EgoAppContext?,
        conversationId: String? = nil,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.repository = repository
        self.context = context
        self.conversationId = conversationId
        self.now = now
    }
}

extension EgoThreadModel {
    /// Sends the non-empty draft unless a turn is already streaming.
    public func send() {
        let message = draft
        guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if let turn, case .streaming = turn.phase { return }

        messages.append(
            EgoMessage(
                id: UUID().uuidString, role: .user, parts: [.text(message)], createdAt: now())
        )
        draft = ""
        startTurn(message: message)
    }

    /// Retries the last user message after a failed turn without duplicating it.
    public func retry() {
        guard let turn, case .failed(_, retryable: true) = turn.phase,
            let message = messages.last(where: { $0.role == .user })?.plainText
        else { return }

        self.turn = nil
        startTurn(message: message)
    }

    /// Stops the active stream while preserving its partial output.
    public func cancel() {
        guard var turn, case .streaming = turn.phase else { return }
        streamTask?.cancel()
        streamTask = nil
        activeStreamID = nil
        turn.phase = .failed(message: "Stopped", retryable: true)
        self.turn = turn
    }

    /// Loads the current conversation, if one is selected.
    public func load() async {
        await readConversation()
    }

    /// Re-reads the conversation after a batch decision.
    public func reload() async {
        await readConversation()
    }

    /// Returns the pending navigation target once and clears it.
    public func consumeNavigation() -> String? {
        defer { navigationTarget = nil }
        return navigationTarget
    }
}

extension EgoThreadModel {
    private func startTurn(message: String) {
        streamTask?.cancel()
        let streamID = UUID()
        activeStreamID = streamID
        turn = .initial
        let stream = repository.streamChat(
            message: message,
            conversationId: conversationId,
            context: context())
        streamTask = Task { [weak self] in
            await self?.consume(stream, streamID: streamID)
        }
    }

    private func consume(
        _ stream: AsyncThrowingStream<EgoStreamEvent, any Error>,
        streamID: UUID
    ) async {
        do {
            for try await event in stream {
                guard activeStreamID == streamID else { return }
                apply(event)
                switch event {
                case .done:
                    endStream(streamID, clearTurn: true)
                    return
                case .failed:
                    endStream(streamID, clearTurn: false)
                    return
                default:
                    continue
                }
            }
            let failure = Self.failureCopy(for: RepositoryError.unavailable)
            failTurn(failure, streamID: streamID)
        } catch {
            failTurn(Self.failureCopy(for: error), streamID: streamID)
        }
    }

    private func apply(_ event: EgoStreamEvent) {
        guard let turn else { return }
        if case .part(.actions(let part)) = event, applyBatchUpdate(part) { return }

        self.turn = EgoTurnReducer.reduce(turn, applying: event)
        switch event {
        case .navigate(let uri):
            navigationTarget = uri
        case .done(let conversationId, let messageId, let parts):
            self.conversationId = conversationId
            messages.append(
                EgoMessage(id: messageId, role: .assistant, parts: parts, createdAt: now()))
        case .token, .tool, .part, .failed:
            break
        }
    }

    private func endStream(_ streamID: UUID, clearTurn: Bool) {
        guard activeStreamID == streamID else { return }
        activeStreamID = nil
        streamTask = nil
        if clearTurn { turn = nil }
    }

    private func failTurn(
        _ failure: (message: String, retryable: Bool),
        streamID: UUID
    ) {
        guard activeStreamID == streamID, var turn else { return }
        turn.phase = .failed(message: failure.message, retryable: failure.retryable)
        self.turn = turn
        endStream(streamID, clearTurn: false)
    }
}

extension EgoThreadModel {
    private func readConversation() async {
        guard let requestedID = conversationId else { return }
        loadFailure = nil

        do {
            guard let thread = try await repository.conversation(id: requestedID) else {
                conversationId = nil
                messages = []
                return
            }
            conversationId = thread.conversation.id
            messages = thread.messages
        } catch {
            loadFailure = Self.repositoryFailure(for: error)
        }
    }

    /// Replaces an existing transcript batch in place; unmatched parts remain part of the turn.
    private func applyBatchUpdate(_ part: EgoActionsPart) -> Bool {
        for messageIndex in messages.indices.reversed() {
            let parts = messages[messageIndex].parts
            guard
                let partIndex = parts.firstIndex(where: { candidate in
                    guard case .actions(let actions) = candidate else { return false }
                    return actions.batchId == part.batchId
                })
            else { continue }

            var updatedParts = parts
            updatedParts[partIndex] = .actions(part)
            let message = messages[messageIndex]
            messages[messageIndex] = EgoMessage(
                id: message.id,
                role: message.role,
                parts: updatedParts,
                createdAt: message.createdAt)
            return true
        }
        return false
    }

    private static func repositoryFailure(for error: any Error) -> RepositoryError {
        (error as? RepositoryError) ?? .unavailable
    }

    private static func failureCopy(for error: any Error) -> (message: String, retryable: Bool) {
        guard let error = error as? RepositoryError else {
            return ("Ego couldn't complete the request. Try again.", true)
        }
        switch error {
        case .unavailable:
            return ("Ego is unavailable. Try again.", true)
        case .unauthorized:
            return ("Your session needs attention before Ego can continue.", false)
        case .contractMismatch:
            return ("Ego returned a response this app can't read.", false)
        case .conflict:
            return ("This conversation changed. Reload it before trying again.", false)
        case .transport(let failure):
            return (
                "Ego couldn't complete the request. Try again.",
                failure.popsError?.retryable ?? true
            )
        case .dependencyNotBound:
            return ("Ego isn't available in this app.", false)
        }
    }
}
