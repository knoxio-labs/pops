import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego thread model batch continuation")
internal struct EgoThreadModelBatchContinuationTests {
    @Test("confirmed and all-rejected batches are continuable")
    func resolvedStatusesCanContinue() async {
        let confirmed = await loadedModel(
            messages: [
                message(
                    id: "assistant-1",
                    parts: [
                        .actions(actions(batchID: "confirmed", statuses: [.confirmed, .rejected]))
                    ])
            ])
        let rejected = await loadedModel(
            messages: [
                message(
                    id: "assistant-1",
                    parts: [
                        .actions(actions(batchID: "rejected", statuses: [.rejected, .rejected]))
                    ])
            ])

        #expect(confirmed.continuableBatchId == "confirmed")
        #expect(rejected.continuableBatchId == "rejected")
    }

    @Test("pending, executed and empty action sets cannot continue")
    func ineligibleStatusesCannotContinue() async {
        let executed = await loadedModel(
            messages: [
                message(
                    id: "assistant-1",
                    parts: [
                        .actions(actions(batchID: "executed", statuses: [.executed, .rejected]))
                    ])
            ])
        let pending = await loadedModel(
            messages: [
                message(
                    id: "assistant-1",
                    parts: [
                        .actions(actions(batchID: "pending", statuses: [.pending, .confirmed]))
                    ])
            ])
        let empty = await loadedModel(
            messages: [
                message(
                    id: "assistant-1",
                    parts: [.actions(EgoActionsPart(batchId: "empty", actions: []))])
            ])

        #expect(executed.continuableBatchId == nil)
        #expect(pending.continuableBatchId == nil)
        #expect(empty.continuableBatchId == nil)
    }

    @Test("only the last assistant message's last action part can continue")
    func continuationUsesLastAssistantMessage() async {
        let laterMessage = await loadedModel(
            messages: [
                message(
                    id: "assistant-1",
                    parts: [
                        .actions(actions(batchID: "older", statuses: [.confirmed, .rejected]))
                    ]),
                message(id: "user-2", role: .user, parts: [.text("later")]),
            ])
        let nonAssistant = await loadedModel(
            messages: [
                message(
                    id: "user-1",
                    role: .user,
                    parts: [.actions(actions(batchID: "user", statuses: [.confirmed]))])
            ])
        let lastActionPart = await loadedModel(
            messages: [
                message(
                    id: "assistant-1",
                    parts: [
                        .actions(actions(batchID: "older", statuses: [.confirmed])),
                        .text("later text"),
                        .actions(actions(batchID: "last", statuses: [.executed, .rejected])),
                    ])
            ])

        #expect(laterMessage.continuableBatchId == nil)
        #expect(nonAssistant.continuableBatchId == nil)
        #expect(lastActionPart.continuableBatchId == nil)
    }

    @Test("continue resumes once without deciding or reloading")
    func continuesWithoutDecisionOrReload() async {
        let batch = actions(batchID: "batch-1", statuses: [.confirmed, .rejected])
        let thread = EgoThreadModelFixtures.thread(
            messages: [message(id: "assistant-1", parts: [.actions(batch)])])
        let repository = ScriptedEgoRepository(
            chatScripts: [
                EgoThreadModelFixtures.script(
                    doneID: "assistant-2", parts: [.text("continued")])
            ],
            threads: ["conversation-1": thread])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")
        await model.load()
        let readsBeforeContinue = await repository.conversationReads

        await model.continueBatch("wrong-batch")
        #expect(await repository.callLog == ["conversation"])
        await model.continueBatch("batch-1")
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        #expect(
            await repository.resumeChatCalls == [
                ScriptedEgoResumeChatCall(
                    conversationId: "conversation-1", batchId: "batch-1")
            ])
        #expect(await repository.decisions.isEmpty)
        #expect(await repository.conversationReads == readsBeforeContinue)
        #expect(await repository.callLog == ["conversation", "resumeChat"])
        #expect(model.messages.last?.plainText == "continued")
    }

    @Test("a continuable batch becomes unavailable during its resumed stream")
    func cannotContinueWhileResuming() async {
        let batch = actions(batchID: "batch-1", statuses: [.confirmed, .rejected])
        let thread = EgoThreadModelFixtures.thread(
            messages: [message(id: "assistant-1", parts: [.actions(batch)])])
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(
            reads: [.success(thread)], streamControl: stream)
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")
        await model.load()

        await model.continueBatch("batch-1")
        await awaitObservedCondition { model.turn?.phase == .streaming }
        #expect(!model.canDecideBatch)
        #expect(model.continuableBatchId == nil)
        await repository.waitForResumeCallCount(1)

        await model.continueBatch("batch-1")
        await model.continueBatch("wrong-batch")
        #expect(await repository.resumeCalls.count == 1)

        stream.yield(
            .done(
                conversationId: "conversation-1",
                messageId: "assistant-2",
                parts: [.text("continued")]))
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }
        stream.finish()
    }

    private func loadedModel(messages: [EgoMessage]) async -> EgoThreadModel {
        let thread = EgoThreadModelFixtures.thread(messages: messages)
        let repository = ScriptedEgoRepository(threads: ["conversation-1": thread])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")
        await model.load()
        return model
    }

    private func actions(batchID: String, statuses: [EgoActionStatus]) -> EgoActionsPart {
        EgoThreadModelFixtures.actions(batchID: batchID, statuses: statuses)
    }

    private func message(
        id: String,
        role: EgoRole = .assistant,
        parts: [EgoMessagePart]
    ) -> EgoMessage {
        EgoThreadModelFixtures.message(id: id, role: role, parts: parts)
    }
}
