import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego resumed thread turn")
internal struct EgoThreadModelResumedTurnTests {
    private static let decision = EgoBatchDecision(
        approve: ["action-1"], reject: ["action-2"], alwaysAllow: ["finance.create"])

    @Test("resumed action updates replace a transcript batch and keep tool activity")
    func resumedActionsUpdateInPlace() async throws {
        let pending = EgoThreadModelFixtures.actions(batchID: "batch-1", status: .pending)
        let updated = EgoThreadModelFixtures.actions(
            batchID: "batch-1", statuses: [.executed, .rejected, .rejected])
        let thread = EgoThreadModelFixtures.thread(
            messages: [
                EgoThreadModelFixtures.message(id: "assistant-1", parts: [.actions(pending)])
            ])
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(
            reads: [.success(thread), .success(thread)], streamControl: stream)
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        await model.load()
        try await model.decideBatch("batch-1", Self.decision)

        await yield(.tool(name: "finance.create", status: .started), on: stream) {
            model.turn?.tools.count == 1
        }
        #expect(
            model.turn?.tools == [
                EgoToolActivity(id: 0, name: "finance.create", status: .started)
            ])
        await yield(.tool(name: "finance.create", status: .finished), on: stream) {
            model.turn?.tools.first?.status == .finished
        }
        await yield(.part(.actions(updated)), on: stream) {
            model.messages.first?.parts == [.actions(updated)]
        }
        #expect(model.turn?.parts.isEmpty == true)

        await yield(.token("continued"), on: stream) {
            model.turn?.streamedText == "continued"
        }
        await finishResume(stream, model: model)
        stream.finish()

        #expect(transcriptBatches(in: model.messages) == [updated])
        #expect(await repository.decisionIDs == ["batch-1"])
    }

    @Test("a thrown resumed failure keeps partial text and cannot be retried")
    func resumedThrownFailureIsNonRetryable() async throws {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [.token("partial output")],
                    trailingError: RepositoryError.unavailable)
            ],
            threads: ["conversation-1": EgoThreadModelFixtures.thread()])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        try await model.decideBatch("batch-1", Self.decision)
        await awaitObservedCondition {
            model.turn?.phase
                == .failed(message: "Ego is unavailable. Try again.", retryable: false)
        }

        #expect(model.turn?.streamedText == "partial output")
        model.retry()
        #expect(await repository.resumeChatCalls.count == 1)
        #expect(await repository.streamChatCalls.isEmpty)
    }

    @Test("a resumed failed event cannot be retried")
    func resumedFailedEventIsNonRetryable() async throws {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [
                        .token("partial output"),
                        .failed(message: "writes were interrupted", retryable: true),
                    ])
            ],
            threads: ["conversation-1": EgoThreadModelFixtures.thread()])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        try await model.decideBatch("batch-1", Self.decision)
        await awaitObservedCondition {
            model.turn?.phase
                == .failed(message: "writes were interrupted", retryable: false)
        }

        #expect(model.turn?.streamedText == "partial output")
        model.retry()
        #expect(await repository.resumeChatCalls.count == 1)
        #expect(await repository.streamChatCalls.isEmpty)
    }

    @Test("an interrupted write batch can continue and route from the resumed turn")
    func interruptedBatchCanContinueAndNavigate() async throws {
        let setup = await interruptedBatchSetup()
        let model = setup.model

        try await model.decideBatch("batch-1", Self.decision)
        await awaitObservedCondition {
            model.turn?.phase
                == EgoTurnPhase.failed(message: "Ego is unavailable. Try again.", retryable: false)
        }

        #expect(model.turn?.streamedText == "partial output")
        #expect(model.messages.first?.parts == [EgoMessagePart.actions(setup.interrupted)])
        #expect(model.continuableBatchId == "batch-1")

        await model.continueBatch("batch-1")
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        #expect(model.navigationTarget == "pops://finance/transaction/1")
        #expect(model.messages.last?.plainText == "continued")
        #expect(await setup.repository.resumeChatCalls.count == 2)
        #expect(await setup.repository.conversationReads.count == 2)
        #expect(await setup.repository.decisions.count == 1)
    }

    private struct InterruptedBatchSetup {
        let model: EgoThreadModel
        let repository: ScriptedEgoRepository
        let interrupted: EgoActionsPart
    }

    private func interruptedBatchSetup() async -> InterruptedBatchSetup {
        let original = EgoThreadModelFixtures.actions(
            batchID: "batch-1", statuses: [.confirmed, .rejected])
        let interrupted = EgoThreadModelFixtures.actions(
            batchID: "batch-1", statuses: [.executed, .confirmed])
        let thread = EgoThreadModelFixtures.thread(
            messages: [
                EgoThreadModelFixtures.message(id: "assistant-1", parts: [.actions(original)])
            ])
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [.part(.actions(interrupted)), .token("partial output")],
                    trailingError: RepositoryError.unavailable),
                ScriptedEgoChatScript(
                    events: [
                        .navigate(uri: "pops://finance/transaction/1"),
                        .done(
                            conversationId: "conversation-1",
                            messageId: "assistant-2",
                            parts: [.text("continued")]),
                    ]),
            ],
            threads: ["conversation-1": thread])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")
        await model.load()
        return InterruptedBatchSetup(
            model: model, repository: repository, interrupted: interrupted)
    }

    @Test("cancelling a resumed turn leaves a non-retryable partial failure")
    func cancellingResumeIsNonRetryable() async throws {
        let thread = EgoThreadModelFixtures.thread()
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(
            reads: [.success(thread)], streamControl: stream)
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        try await model.decideBatch("batch-1", Self.decision)
        await yield(.token("partial output"), on: stream) {
            model.turn?.streamedText == "partial output"
        }

        model.cancel()
        #expect(model.turn?.phase == .failed(message: "Stopped", retryable: false))
        model.retry()
        await repository.waitForResumeCallCount(1)
        #expect(await repository.decisionIDs == ["batch-1"])
        #expect(await repository.resumeCalls.count == 1)
        stream.finish()
    }

    private func yield(
        _ event: EgoStreamEvent,
        on stream: EgoThreadModelStreamControl,
        until condition: @escaping @Sendable @MainActor () -> Bool
    ) async {
        stream.yield(event)
        await awaitObservedCondition(condition)
    }

    private func transcriptBatches(in messages: [EgoMessage]) -> [EgoActionsPart] {
        messages.flatMap(\.parts).compactMap { part in
            guard case .actions(let actions) = part else { return nil }
            return actions
        }
    }

    private func finishResume(
        _ stream: EgoThreadModelStreamControl,
        model: EgoThreadModel
    ) async {
        await yield(
            .done(
                conversationId: "conversation-1",
                messageId: "assistant-2",
                parts: [.text("The approved work is done.")]),
            on: stream
        ) {
            model.turn == nil && model.messages.count == 2
        }
    }
}
