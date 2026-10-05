import AppCore
import AppCoreFakes
import Foundation
import Testing

@Suite("Scripted Ego repository")
internal struct ScriptedEgoRepositoryTests {
    @Test("events arrive in order before the scripted trailing error")
    func streamsEventsAndTrailingError() async throws {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [
                        .token("Found it."),
                        .tool(name: "inventory.search", status: .finished),
                    ],
                    trailingError: RepositoryError.unavailable)
            ])
        var iterator = repository.streamChat(
            message: "find my drill", conversationId: nil, context: nil
        ).makeAsyncIterator()

        #expect(try await iterator.next() == .token("Found it."))
        #expect(try await iterator.next() == .tool(name: "inventory.search", status: .finished))
        await #expect(throws: RepositoryError.unavailable) {
            try await iterator.next()
        }

        let calls = await repository.streamChatCalls
        #expect(calls.map(\.message) == ["find my drill"])
    }

    @Test("chat and resume consume scripts from the same queue")
    func chatAndResumeShareScripts() async throws {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(events: [.token("first")]),
                ScriptedEgoChatScript(events: [.token("second")]),
                ScriptedEgoChatScript(events: [.token("resumed")]),
            ])

        let first = try await collect(
            repository.streamChat(
                message: "first request", conversationId: nil, context: nil))
        let second = try await collect(
            repository.streamChat(
                message: "second request", conversationId: "conversation-1", context: nil))
        let resumed = try await collect(
            repository.resumeChat(
                conversationId: "conversation-1", batchId: "batch-1"))

        #expect(first == [.token("first")])
        #expect(second == [.token("second")])
        #expect(resumed == [.token("resumed")])
        #expect(await repository.callLog == ["streamChat", "streamChat", "resumeChat"])
    }

    @Test("records stream, query, and conversation arguments")
    func recordsCallArguments() async throws {
        let context = EgoAppContext(
            app: "finance", uri: "pops:finance/transaction/9", route: "/transactions/9",
            entityTitle: "Groceries")
        let createdAt = Date(timeIntervalSince1970: 1_700_000_000)
        let conversation = EgoConversation(
            id: "conversation-1", title: "Groceries", createdAt: createdAt, updatedAt: createdAt)
        let message = EgoMessage(
            id: "message-1", role: .assistant, parts: [.text("Found it.")], createdAt: createdAt)
        let thread = EgoThread(conversation: conversation, messages: [message])
        let repository = ScriptedEgoRepository(
            chatScripts: [ScriptedEgoChatScript(events: [])],
            threads: [conversation.id: thread],
            conversations: [conversation])

        _ = try await collect(
            repository.streamChat(
                message: "show this transaction", conversationId: conversation.id, context: context)
        )
        let listed = try await repository.conversations(limit: 5, offset: 2, query: "grocery")
        let loaded = try await repository.conversation(id: conversation.id)
        let missing = try await repository.conversation(id: "gone")

        #expect(listed == [conversation])
        #expect(loaded == thread)
        #expect(missing == nil)
        #expect(
            await repository.streamChatCalls == [
                ScriptedEgoStreamChatCall(
                    message: "show this transaction", conversationId: conversation.id,
                    context: context)
            ])
        #expect(
            await repository.conversationQueries == [
                ScriptedEgoConversationQuery(limit: 5, offset: 2, query: "grocery")
            ])
        #expect(await repository.conversationReads == [conversation.id, "gone"])
    }

    @Test("the fake dependency container binds a scripted Ego repository by default")
    func appDependenciesFakeBindsEgo() async throws {
        let dependencies = AppDependencies.fake()

        #expect(try await dependencies.ego.conversations(limit: 10, offset: 0, query: nil) == [])
    }

    @Test("a configured decision error is thrown after the decision is recorded")
    func recordsDecisionBeforeThrowing() async {
        let decision = EgoBatchDecision(
            approve: ["action-1"], reject: [], alwaysAllow: ["inventory.read"])
        let repository = ScriptedEgoRepository(decideBatchError: RepositoryError.unavailable)

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.decideBatch(id: "batch-1", decision: decision)
        }

        #expect(
            await repository.decisions == [
                ScriptedEgoBatchDecision(id: "batch-1", decision: decision)
            ])
    }

    @Test("the call log keeps decision, re-read, and resume in order")
    func recordsDecisionReadResumeOrder() async throws {
        let createdAt = Date(timeIntervalSince1970: 1_700_000_000)
        let conversation = EgoConversation(
            id: "conversation-1", title: nil, createdAt: createdAt, updatedAt: createdAt)
        let repository = ScriptedEgoRepository(
            chatScripts: [ScriptedEgoChatScript(events: [.token("continued")])],
            threads: [conversation.id: EgoThread(conversation: conversation, messages: [])])
        let decision = EgoBatchDecision(approve: ["action-1"], reject: [], alwaysAllow: [])

        try await repository.decideBatch(id: "batch-1", decision: decision)
        _ = try await repository.conversation(id: conversation.id)
        _ = try await collect(
            repository.resumeChat(
                conversationId: conversation.id, batchId: "batch-1"))

        #expect(await repository.callLog == ["decideBatch", "conversation", "resumeChat"])
        #expect(
            await repository.resumeChatCalls == [
                ScriptedEgoResumeChatCall(conversationId: conversation.id, batchId: "batch-1")
            ])
    }

    @Test("decideBatch waits for its configured gate")
    func decisionWaitsForGate() async throws {
        let gate = AsyncTestGate()
        let returned = AsyncTestFlag()
        let repository = ScriptedEgoRepository(decideGate: { await gate.wait() })
        let task = Task {
            try await repository.decideBatch(
                id: "batch-1", decision: EgoBatchDecision(approve: [], reject: [], alwaysAllow: []))
            await returned.set()
        }

        await gate.waitUntilEntered()
        #expect(await returned.value() == false)
        await gate.release()
        try await task.value
        #expect(await returned.value() == true)
    }
}

private func collect(
    _ stream: AsyncThrowingStream<EgoStreamEvent, any Error>
) async throws -> [EgoStreamEvent] {
    var events: [EgoStreamEvent] = []
    for try await event in stream {
        events.append(event)
    }
    return events
}

private actor AsyncTestGate {
    private var entered = false
    private var enteredContinuation: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?

    func wait() async {
        entered = true
        enteredContinuation?.resume()
        enteredContinuation = nil
        await withCheckedContinuation { releaseContinuation = $0 }
    }

    func waitUntilEntered() async {
        guard !entered else { return }
        await withCheckedContinuation { enteredContinuation = $0 }
    }

    func release() {
        releaseContinuation?.resume()
        releaseContinuation = nil
    }
}

private actor AsyncTestFlag {
    private var didSet = false

    func set() {
        didSet = true
    }

    func value() -> Bool {
        didSet
    }
}
