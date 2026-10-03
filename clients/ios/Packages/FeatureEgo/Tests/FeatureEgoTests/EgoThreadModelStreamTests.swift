import AppCore
import Foundation
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego thread model streaming")
internal struct EgoThreadModelStreamTests {
    @Test("late events from a cancelled stream cannot finish the turn")
    func ignoresLateEventsAfterCancel() async {
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(streamControl: stream)
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = "question"

        model.send()
        stream.yield(.token("partial"))
        await awaitObservedCondition { model.turn?.streamedText == "partial" }

        model.cancel()
        stream.yield(
            .done(
                conversationId: "stale-conversation", messageId: "stale-assistant",
                parts: [.text("stale")]))
        stream.finish()
        await awaitObservedCondition(deadline: .milliseconds(100)) {
            model.messages.count > 1 || model.conversationId != nil
        }

        #expect(model.turn?.streamedText == "partial")
        #expect(model.turn?.phase == .failed(message: "Stopped", retryable: true))
        #expect(model.messages.count == 1)
        #expect(model.conversationId == nil)
    }

    @Test("a failed event retains partial output and its retryability")
    func failedEventPreservesPartialTurn() async {
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(streamControl: stream)
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = "question"

        model.send()
        stream.yield(.token("partial"))
        await awaitObservedCondition { model.turn?.streamedText == "partial" }
        stream.yield(.failed(message: "Try later", retryable: false))
        await awaitObservedCondition {
            guard let phase = model.turn?.phase else { return false }
            if case .failed = phase { return true }
            return false
        }

        #expect(model.turn?.streamedText == "partial")
        #expect(model.turn?.phase == .failed(message: "Try later", retryable: false))
    }

    @Test("batch updates replace transcript parts while unmatched parts stay on the turn")
    func batchUpdatesReplaceMatchingTranscriptPart() async {
        let original = EgoThreadModelFixtures.actions(batchID: "batch-1", status: .pending)
        let updated = EgoThreadModelFixtures.actions(batchID: "batch-1", status: .rejected)
        let unmatched = EgoThreadModelFixtures.actions(batchID: "batch-2", status: .pending)
        let thread = EgoThreadModelFixtures.thread(
            messages: [
                EgoThreadModelFixtures.message(id: "assistant-1", parts: [.actions(original)])
            ])
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(
            reads: [.success(thread)], streamControl: stream)
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        await model.load()
        model.draft = "continue"
        model.send()
        stream.yield(.part(.actions(updated)))
        await awaitObservedCondition { model.messages.first?.parts == [.actions(updated)] }

        #expect(model.messages[0].id == "assistant-1")
        #expect(model.messages[0].createdAt == EgoThreadModelFixtures.now)
        #expect(model.turn?.parts.isEmpty == true)

        stream.yield(.part(.actions(unmatched)))
        await awaitObservedCondition { model.turn?.parts == [.actions(unmatched)] }
        stream.yield(
            .done(
                conversationId: "conversation-1", messageId: "assistant-2",
                parts: [.actions(unmatched)]))
        await awaitObservedCondition { model.turn == nil && model.messages.count == 3 }
        #expect(model.messages[2].parts == [.actions(unmatched)])
    }

    @Test("navigation can be consumed once")
    func consumesNavigationOnce() async {
        let stream = EgoThreadModelStreamControl()
        let repository = ControlledEgoRepository(streamControl: stream)
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = "open this"

        model.send()
        stream.yield(.navigate(uri: "pops:finance/transaction/1"))
        await awaitObservedCondition { model.navigationTarget != nil }

        #expect(model.consumeNavigation() == "pops:finance/transaction/1")
        #expect(model.consumeNavigation() == nil)
        stream.yield(.done(conversationId: "conversation-1", messageId: "assistant-1", parts: []))
        await awaitObservedCondition { model.turn == nil }
    }
}
