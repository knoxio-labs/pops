import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego flow")
internal struct EgoFlowTests {
    @Test("starts with a new thread model")
    func startsNew() {
        let flow = makeFlow()

        #expect(flow.thread.conversationId == nil)
    }

    @Test("opening a conversation replaces the thread and pops the list")
    func openReplacesThread() {
        let flow = makeFlow()
        let oldThread = flow.thread
        flow.isShowingConversations = true

        flow.open(conversation("conversation-1"))

        #expect(flow.thread !== oldThread)
        #expect(flow.thread.conversationId == "conversation-1")
        #expect(!flow.isShowingConversations)
    }

    @Test("startNew clears the selected conversation")
    func startNewClearsConversation() {
        let flow = makeFlow()
        flow.open(conversation("conversation-1"))
        let oldThread = flow.thread

        flow.startNew()

        #expect(flow.thread !== oldThread)
        #expect(flow.thread.conversationId == nil)
    }

    @Test("replacing a streaming thread cancels it without another repository call")
    func replacementCancelsStream() async {
        let repository = FlowTestRepository()
        let flow = makeFlow(repository: repository)
        let oldThread = flow.thread
        oldThread.draft = "Keep this turn open"
        oldThread.send()
        await repository.waitForStreamCount(1)

        flow.open(conversation("conversation-2"))

        #expect(oldThread.turn?.phase == .failed(message: "Stopped", retryable: true))
        #expect(flow.thread.conversationId == "conversation-2")
        #expect(await repository.streamCount == 1)
        #expect(await repository.readCount == 0)
    }

    @Test("the thread receives the context provided to the flow")
    func forwardsContextClosure() async {
        let expected = EgoAppContext(
            app: "inventory",
            uri: "pops:inventory/item/42",
            route: "item/42",
            entityTitle: "Blue bike"
        )
        let repository = FlowTestRepository()
        let flow = EgoFlow(
            dependencies: .fake(ego: repository),
            context: { expected },
            entityRouter: EntityRouterRegistry()
        )
        flow.thread.draft = "Where is it?"
        flow.thread.send()

        await repository.waitForStreamCount(1)

        #expect(await repository.contexts == [expected])
    }

    @Test("stages an initial prompt through the normal thread send path")
    func stagesInitialPrompt() async {
        let repository = FlowTestRepository()
        let flow = EgoFlow(
            dependencies: .fake(ego: repository),
            context: { nil },
            entityRouter: EntityRouterRegistry(),
            initialPrompt: "Show a sample answer"
        )

        await flow.stageInitialState()
        await repository.waitForStreamCount(1)
        await flow.stageInitialState()

        #expect(await repository.streamCount == 1)
    }

    @Test("stages a saved conversation and resumes its decided batch")
    func stagesSavedContinuation() async {
        let batch = EgoThreadModelFixtures.actions(
            batchID: "batch-1", statuses: [.confirmed, .rejected])
        let thread = EgoThreadModelFixtures.thread(
            messages: [
                EgoThreadModelFixtures.message(id: "assistant-1", parts: [.actions(batch)])
            ])
        let repository = ControlledEgoRepository(
            reads: [.success(thread)], streamControl: EgoThreadModelStreamControl())
        let flow = EgoFlow(
            dependencies: .fake(ego: repository),
            context: { nil },
            entityRouter: EntityRouterRegistry(),
            initialConversationId: "conversation-1",
            continueBatchId: "batch-1"
        )

        await flow.stageInitialState()
        await repository.waitForResumeCallCount(1)

        #expect(
            await repository.resumeCalls == [
                ScriptedEgoResumeChatCall(
                    conversationId: "conversation-1", batchId: "batch-1")
            ])
        #expect(await repository.decisionIDs.isEmpty)
    }

    private func makeFlow(repository: any EgoRepository = ScriptedEgoRepository()) -> EgoFlow {
        EgoFlow(
            dependencies: .fake(ego: repository),
            context: { nil },
            entityRouter: EntityRouterRegistry()
        )
    }

    private func conversation(_ id: String) -> EgoConversation {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        return EgoConversation(id: id, title: "Conversation", createdAt: now, updatedAt: now)
    }
}

private actor FlowTestRepository: EgoRepository {
    nonisolated let streamControl = FlowStreamControl()

    private(set) var streamCount = 0
    private(set) var readCount = 0
    private(set) var contexts: [EgoAppContext?] = []
    private var streamWaiters: [(Int, CheckedContinuation<Void, Never>)] = []

    nonisolated func streamChat(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        Task { await recordStream(context: context) }
        return streamControl.stream
    }

    func conversations(limit: Int, offset: Int, query: String?) async throws -> [EgoConversation] {
        []
    }

    func conversation(id: String) async throws -> EgoThread? {
        readCount += 1
        return nil
    }

    func decideBatch(id: String, decision: EgoBatchDecision) async throws {}

    nonisolated func resumeChat(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        streamControl.stream
    }

    func waitForStreamCount(_ count: Int) async {
        guard streamCount < count else { return }
        await withCheckedContinuation { continuation in
            streamWaiters.append((count, continuation))
        }
    }

    private func recordStream(context: EgoAppContext?) {
        streamCount += 1
        contexts.append(context)
        let ready = streamWaiters.filter { $0.0 <= streamCount }
        streamWaiters.removeAll { $0.0 <= streamCount }
        for (_, continuation) in ready { continuation.resume() }
    }
}

private final class FlowStreamControl: @unchecked Sendable {
    let stream: AsyncThrowingStream<EgoStreamEvent, any Error>
    private let continuation: AsyncThrowingStream<EgoStreamEvent, any Error>.Continuation

    init() {
        (stream, continuation) = AsyncThrowingStream.makeStream()
    }
}
