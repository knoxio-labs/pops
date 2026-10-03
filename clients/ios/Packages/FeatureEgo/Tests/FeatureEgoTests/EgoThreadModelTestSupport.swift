import AppCore
import AppCoreFakes
import Foundation
import Observation

@testable import FeatureEgo

internal enum EgoThreadModelFixtures {
    static let now = Date(timeIntervalSince1970: 1_800_000_000)

    @MainActor
    static func model(
        repository: any EgoRepository,
        conversationId: String? = nil,
        context: @escaping @MainActor () -> EgoAppContext? = { nil }
    ) -> EgoThreadModel {
        EgoThreadModel(
            repository: repository,
            context: context,
            conversationId: conversationId,
            now: { now })
    }

    static func message(
        id: String,
        role: EgoRole = .assistant,
        parts: [EgoMessagePart]
    ) -> EgoMessage {
        EgoMessage(id: id, role: role, parts: parts, createdAt: now)
    }

    static func thread(messages: [EgoMessage] = []) -> EgoThread {
        EgoThread(
            conversation: EgoConversation(
                id: "conversation-1", title: "Thread", createdAt: now, updatedAt: now),
            messages: messages)
    }

    static func actions(batchID: String, status: EgoActionStatus) -> EgoActionsPart {
        EgoActionsPart(
            batchId: batchID,
            actions: ["one", "two", "three"].map { actionID in
                EgoBatchAction(
                    actionId: actionID, tool: "finance.create", summary: actionID, status: status)
            })
    }

    static func script(doneID: String, parts: [EgoMessagePart] = []) -> ScriptedEgoChatScript {
        ScriptedEgoChatScript(
            events: [
                .done(conversationId: "conversation-1", messageId: doneID, parts: parts)
            ])
    }
}

internal final class EgoThreadModelStreamControl: @unchecked Sendable {
    let stream: AsyncThrowingStream<EgoStreamEvent, any Error>
    private let continuation: AsyncThrowingStream<EgoStreamEvent, any Error>.Continuation

    init() {
        (stream, continuation) = AsyncThrowingStream.makeStream()
    }

    func yield(_ event: EgoStreamEvent) {
        continuation.yield(event)
    }

    func finish() {
        continuation.finish()
    }
}

@MainActor
internal final class EgoThreadModelContextBox {
    var value: EgoAppContext?

    init(_ value: EgoAppContext?) {
        self.value = value
    }
}

internal actor ControlledEgoRepository: EgoRepository {
    nonisolated let streamControl: EgoThreadModelStreamControl
    private var reads: [Result<EgoThread?, RepositoryError>]

    init(
        reads: [Result<EgoThread?, RepositoryError>] = [],
        streamControl: EgoThreadModelStreamControl = EgoThreadModelStreamControl()
    ) {
        self.reads = reads
        self.streamControl = streamControl
    }

    nonisolated func streamChat(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        streamControl.stream
    }

    func conversations(limit: Int, offset: Int, query: String?) async throws -> [EgoConversation] {
        []
    }

    func conversation(id: String) async throws -> EgoThread? {
        guard !reads.isEmpty else { return nil }
        return try reads.removeFirst().get()
    }

    func decideBatch(id: String, decision: EgoBatchDecision) async throws {}

    nonisolated func resumeChat(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        streamControl.stream
    }
}

@MainActor
internal func awaitObservedCondition(
    deadline: Duration = .seconds(2),
    _ predicate: @escaping @Sendable @MainActor () -> Bool
) async {
    if predicate() { return }
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        let resumeOnce = EgoThreadModelTestWaiter(continuation)
        trackObservedConditionUntilTrue(predicate, resuming: resumeOnce)
        Task {
            try? await Task.sleep(for: deadline)
            await resumeOnce.resume()
        }
    }
}

@MainActor
private func trackObservedConditionUntilTrue(
    _ predicate: @escaping @Sendable @MainActor () -> Bool,
    resuming resumeOnce: EgoThreadModelTestWaiter
) {
    withObservationTracking {
        _ = predicate()
    } onChange: {
        Task { @MainActor in
            if predicate() {
                await resumeOnce.resume()
            } else {
                trackObservedConditionUntilTrue(predicate, resuming: resumeOnce)
            }
        }
    }
}

private actor EgoThreadModelTestWaiter {
    private var continuation: CheckedContinuation<Void, Never>?

    init(_ continuation: CheckedContinuation<Void, Never>) {
        self.continuation = continuation
    }

    func resume() {
        continuation?.resume()
        continuation = nil
    }
}
