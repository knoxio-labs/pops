import Foundation

/// Transport-independent access to Ego conversations and streamed turns.
///
/// Implementations own the wire format and transport. Features depend on this
/// seam so they can use Ego without naming the BFM client or a concrete
/// network implementation.
public protocol EgoRepository: Sendable {
    /// Starts a chat turn and returns its events as they arrive.
    ///
    /// - Parameters:
    ///   - message: The user's message.
    ///   - conversationId: The conversation to continue, or `nil` to start one.
    ///   - context: The app and screen context for this turn, when available.
    /// - Returns: A stream of tokens, tool activity, message parts, navigation,
    ///   and a terminal completion or failure event.
    func streamChat(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error>

    /// Lists conversations using the supplied page and search query.
    ///
    /// - Parameters:
    ///   - limit: Maximum number of conversations to return.
    ///   - offset: Number of matching conversations to skip.
    ///   - query: Optional title search text.
    /// - Throws: ``RepositoryError`` when the repository cannot complete the read.
    func conversations(limit: Int, offset: Int, query: String?) async throws -> [EgoConversation]

    /// Reads a conversation and its messages.
    ///
    /// A `nil` result means that the conversation no longer exists; it is not
    /// a transport or repository failure.
    ///
    /// - Parameter id: The conversation identifier.
    /// - Returns: The conversation thread, or `nil` when it is absent.
    /// - Throws: ``RepositoryError`` when the repository cannot complete the read.
    func conversation(id: String) async throws -> EgoThread?

    /// Records the user's decision for a proposed action batch.
    ///
    /// This call only records the decision: approved actions become `confirmed`,
    /// the rest become `rejected`, and no tool runs here. After this succeeds,
    /// the caller re-reads the conversation and then calls ``resumeChat(conversationId:batchId:)``.
    /// A batch can be decided only once.
    ///
    /// - Parameters:
    ///   - id: The batch identifier.
    ///   - decision: The action ids to approve or reject and tools to allow for
    ///     the remainder of the conversation.
    /// - Throws: ``RepositoryError`` when the repository cannot record the decision.
    func decideBatch(id: String, decision: EgoBatchDecision) async throws

    /// Resumes a conversation after its proposed action batch was decided.
    ///
    /// The stream first runs approved writes in their proposed order, emitting
    /// a tool event and then an updated batch part for each write, before
    /// streaming the model's continuation. It can also resume a decided batch
    /// that has not been started yet. If an earlier resume was interrupted,
    /// unfinished writes are marked failed as interrupted and are not run a
    /// second time.
    ///
    /// - Parameters:
    ///   - conversationId: The conversation to resume.
    ///   - batchId: The decided action batch.
    /// - Returns: The same event stream used by a new chat turn.
    func resumeChat(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error>
}

/// The default Ego repository until the app composition root binds a transport.
///
/// Every operation fails with ``RepositoryError/dependencyNotBound`` instead
/// of making an unconfigured chat look like an empty conversation.
public struct UnboundEgoRepository: EgoRepository {
    /// Creates an unbound repository for a default dependency value.
    public init() {}

    /// Returns a stream that fails with `dependencyNotBound` when consumed.
    public func streamChat(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        unboundEgoStream()
    }

    /// Fails because the composition root has not bound Ego.
    public func conversations(limit: Int, offset: Int, query: String?) async throws
        -> [EgoConversation]
    {
        throw RepositoryError.dependencyNotBound
    }

    /// Fails because the composition root has not bound Ego.
    public func conversation(id: String) async throws -> EgoThread? {
        throw RepositoryError.dependencyNotBound
    }

    /// Fails because the composition root has not bound Ego.
    public func decideBatch(id: String, decision: EgoBatchDecision) async throws {
        throw RepositoryError.dependencyNotBound
    }

    /// Returns a stream that fails with `dependencyNotBound` when consumed.
    public func resumeChat(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        unboundEgoStream()
    }
}

private func unboundEgoStream() -> AsyncThrowingStream<EgoStreamEvent, any Error> {
    AsyncThrowingStream { continuation in
        continuation.finish(throwing: RepositoryError.dependencyNotBound)
    }
}
