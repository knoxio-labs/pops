import AppCore
import AppCoreFakes
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego thread model batch decisions")
internal struct EgoThreadModelBatchDecisionTests {
    private func gatedDecisionSetup(
        gate: EgoThreadModelBatchGate
    ) async -> (model: EgoThreadModel, repository: ScriptedEgoRepository) {
        let existingBatch = EgoThreadModelFixtures.actions(
            batchID: "batch-1", statuses: [.confirmed, .rejected])
        let thread = EgoThreadModelFixtures.thread(
            messages: [
                EgoThreadModelFixtures.message(
                    id: "assistant-0", parts: [.actions(existingBatch)])
            ])
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [
                        .done(
                            conversationId: "conversation-1",
                            messageId: "assistant-1",
                            parts: [.text("resumed")])
                    ])
            ],
            threads: ["conversation-1": thread],
            decideGate: { await gate.wait() })
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")
        await model.load()
        return (model, repository)
    }

    private static let decision = EgoBatchDecision(
        approve: ["action-1"], reject: ["action-2"], alwaysAllow: ["finance.create"])

    @Test("a decision reloads before resuming and appends the continuation")
    func decidesReloadsAndResumes() async throws {
        let pending = EgoThreadModelFixtures.actions(batchID: "batch-2", status: .pending)
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [
                        .token("continued"),
                        .done(
                            conversationId: "conversation-1",
                            messageId: "assistant-2",
                            parts: [.text("The write is complete."), .actions(pending)]),
                    ])
            ],
            threads: ["conversation-1": EgoThreadModelFixtures.thread()])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        try await model.decideBatch("batch-1", Self.decision)
        await awaitObservedCondition { model.turn == nil && model.messages.count == 1 }

        #expect(
            await repository.decisions == [
                ScriptedEgoBatchDecision(id: "batch-1", decision: Self.decision)
            ])
        #expect(
            await repository.resumeChatCalls == [
                ScriptedEgoResumeChatCall(
                    conversationId: "conversation-1", batchId: "batch-1")
            ])
        #expect(await repository.callLog == ["decideBatch", "conversation", "resumeChat"])
        #expect(model.messages.last?.id == "assistant-2")
        #expect(
            model.messages.last?.parts == [
                .text("The write is complete."),
                .actions(pending),
            ])
        #expect(model.canDecideBatch)
        #expect(model.continuableBatchId == nil)
    }

    @Test("a conflict reloads without starting a second resume")
    func conflictReloadsOnly() async throws {
        let repository = ScriptedEgoRepository(
            threads: ["conversation-1": EgoThreadModelFixtures.thread()],
            decideBatchError: RepositoryError.conflict("already decided"))
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        try await model.decideBatch("batch-1", Self.decision)

        #expect(await repository.conversationReads == ["conversation-1"])
        #expect(await repository.resumeChatCalls.isEmpty)
        #expect(await repository.callLog == ["decideBatch", "conversation"])
        #expect(model.canDecideBatch)
    }

    @Test("a non-conflict decision error is rethrown without reload or resume")
    func rethrowsDecisionFailure() async {
        let repository = ScriptedEgoRepository(decideBatchError: RepositoryError.unavailable)
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        await #expect(throws: RepositoryError.unavailable) {
            try await model.decideBatch("batch-1", Self.decision)
        }

        #expect(await repository.conversationReads.isEmpty)
        #expect(await repository.resumeChatCalls.isEmpty)
        #expect(await repository.callLog == ["decideBatch"])
        #expect(model.canDecideBatch)
    }

    @Test("a streaming turn blocks decisions, then a failed turn permits them")
    func decisionEligibilityTracksStreamingAndFailure() async throws {
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(streamControl: stream)
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        #expect(model.canDecideBatch)
        model.draft = "question"
        model.send()
        await awaitObservedCondition { model.turn?.phase == .streaming }
        #expect(!model.canDecideBatch)

        try await model.decideBatch("batch-1", Self.decision)
        #expect(await repository.decisionIDs.isEmpty)

        stream.yield(.failed(message: "try again", retryable: true))
        await awaitObservedCondition {
            model.turn?.phase == .failed(message: "try again", retryable: true)
        }
        #expect(model.canDecideBatch)
        stream.finish()
    }

    @Test("sends stay blocked while the decision request is in flight")
    func blocksSendUntilResumeStarts() async throws {
        let gate = EgoThreadModelBatchGate()
        let (model, repository) = await gatedDecisionSetup(gate: gate)
        #expect(model.continuableBatchId == "batch-1")
        let task = Task {
            try await model.decideBatch("batch-1", Self.decision)
        }

        await gate.waitUntilEntered()
        #expect(!model.canDecideBatch)
        #expect(model.continuableBatchId == nil)
        model.draft = "must wait"
        model.send()
        #expect(model.messages.count == 1)
        #expect(model.messages.last?.id == "assistant-0")
        #expect(model.draft == "must wait")
        #expect(await repository.streamChatCalls.isEmpty)
        #expect(await repository.resumeChatCalls.isEmpty)

        await gate.release()
        try await task.value
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }
        #expect(
            await repository.callLog
                == ["conversation", "decideBatch", "conversation", "resumeChat"])
        #expect(model.messages.last?.plainText == "resumed")
    }
}

private actor EgoThreadModelBatchGate {
    private var entered = false
    private var enteredContinuation: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?

    func wait() async {
        await withCheckedContinuation { continuation in
            releaseContinuation = continuation
            entered = true
            enteredContinuation?.resume()
            enteredContinuation = nil
        }
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
