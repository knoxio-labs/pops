import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import FeatureEgo

@MainActor
@Suite("Ego thread model")
internal struct EgoThreadModelTests {
    @Test("a normal turn appends the user and final assistant messages")
    func normalTurn() async {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [
                        .token("partial"),
                        .done(
                            conversationId: "conversation-1", messageId: "assistant-1",
                            parts: [.text("final answer")]),
                    ])
            ])
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = "question"

        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        #expect(model.messages.map(\.role) == [.user, .assistant])
        #expect(model.messages[0].parts == [.text("question")])
        #expect(model.messages[0].createdAt == EgoThreadModelFixtures.now)
        #expect(model.messages[1].id == "assistant-1")
        #expect(model.messages[1].parts == [.text("final answer")])
        #expect(model.messages[1].createdAt == EgoThreadModelFixtures.now)
        #expect(model.conversationId == "conversation-1")
    }

    @Test("a welcome prompt is sent without replacing the unsent draft")
    func sendsWelcomePromptPreservingDraft() async {
        let prompt = "Summarize my recent purchases and spending."
        let draft = "Keep this question for after the suggestion."
        let repository = ScriptedEgoRepository(
            chatScripts: [EgoThreadModelFixtures.script(doneID: "assistant-1")])
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = draft

        model.send(prompt: prompt)
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        #expect(model.messages[0].role == .user)
        #expect(model.messages[0].plainText == prompt)
        #expect(model.draft == draft)
        #expect(await repository.streamChatCalls.map(\.message) == [prompt])
    }

    @Test("the next send continues the conversation returned by done")
    func secondSendUsesConversationID() async {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                EgoThreadModelFixtures.script(doneID: "assistant-1"),
                EgoThreadModelFixtures.script(doneID: "assistant-2"),
            ])
        let model = EgoThreadModelFixtures.model(repository: repository)

        model.draft = "first"
        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        model.draft = "second"
        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 4 }

        let calls = await repository.streamChatCalls
        #expect(calls.map(\.conversationId) == [nil, "conversation-1"])
    }

    @Test("a second send while streaming makes no second repository call")
    func ignoresSecondSendWhileStreaming() async {
        let repository = ScriptedEgoRepository(
            chatScripts: [EgoThreadModelFixtures.script(doneID: "assistant-1")])
        let model = EgoThreadModelFixtures.model(repository: repository)

        model.draft = "first"
        model.send()
        model.draft = "second"
        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        #expect(await repository.streamChatCalls.count == 1)
        #expect(model.draft == "second")
    }

    @Test("a whitespace-only draft is ignored")
    func ignoresWhitespaceDraft() async {
        let repository = ScriptedEgoRepository()
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = " \n\t "

        model.send()

        #expect(model.messages.isEmpty)
        #expect(await repository.streamChatCalls.isEmpty)
    }

    @Test("retry resends the last user text without adding another user message")
    func retryReusesUserMessage() async {
        let repository = ScriptedEgoRepository(
            chatScripts: [
                ScriptedEgoChatScript(
                    events: [.token("partial")], trailingError: RepositoryError.unavailable),
                EgoThreadModelFixtures.script(doneID: "assistant-1"),
            ])
        let model = EgoThreadModelFixtures.model(repository: repository)
        model.draft = "find the trip"
        model.send()
        await awaitObservedCondition {
            guard let phase = model.turn?.phase else { return false }
            if case .failed = phase { return true }
            return false
        }

        #expect(model.turn?.streamedText == "partial")
        #expect(
            model.turn?.phase == .failed(message: "Ego is unavailable. Try again.", retryable: true)
        )
        model.retry()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        #expect(model.messages.filter { $0.role == .user }.count == 1)
        #expect(model.messages[0].plainText == "find the trip")
        #expect(
            await repository.streamChatCalls.map(\.message) == ["find the trip", "find the trip"])
    }

    @Test("a completed pending batch stays in the transcript and does not block another send")
    func pendingBatchDoesNotBlockSending() async {
        let batch = EgoThreadModelFixtures.actions(batchID: "batch-1", status: .pending)
        let repository = ScriptedEgoRepository(
            chatScripts: [
                EgoThreadModelFixtures.script(doneID: "assistant-1", parts: [.actions(batch)]),
                EgoThreadModelFixtures.script(doneID: "assistant-2"),
            ])
        let model = EgoThreadModelFixtures.model(repository: repository)

        model.draft = "first"
        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }
        #expect(model.messages[1].parts == [.actions(batch)])

        model.draft = "second"
        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 4 }

        #expect(await repository.streamChatCalls.count == 2)
    }

    @Test("the context closure is evaluated when each message is sent")
    func readsContextPerSend() async {
        let first = EgoAppContext(
            app: "finance", uri: "pops:finance/transaction/1", route: nil, entityTitle: "First")
        let second = EgoAppContext(
            app: "inventory", uri: "pops:inventory/item/2", route: nil, entityTitle: "Second")
        let repository = ScriptedEgoRepository(
            chatScripts: [
                EgoThreadModelFixtures.script(doneID: "assistant-1"),
                EgoThreadModelFixtures.script(doneID: "assistant-2"),
            ])
        let currentContext = EgoThreadModelContextBox(first)
        let model = EgoThreadModelFixtures.model(
            repository: repository, context: { currentContext.value })

        model.draft = "first"
        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 2 }

        currentContext.value = second
        model.draft = "second"
        model.send()
        await awaitObservedCondition { model.turn == nil && model.messages.count == 4 }

        #expect(await repository.streamChatCalls.map(\.context) == [first, second])
    }

    @Test("load clears the transcript and id when the conversation is missing")
    func loadClearsMissingConversation() async {
        let thread = EgoThreadModelFixtures.thread(
            messages: [EgoThreadModelFixtures.message(id: "assistant-1", parts: [.text("old")])])
        let repository = ControlledEgoRepository(
            reads: [.success(thread), .success(nil)])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        await model.load()
        #expect(model.messages == thread.messages)
        #expect(model.conversationId == "conversation-1")
        await model.load()

        #expect(model.messages.isEmpty)
        #expect(model.conversationId == nil)
        #expect(model.loadFailure == nil)
    }

    @Test("reload failure preserves the transcript and records its repository failure")
    func reloadFailurePreservesMessages() async {
        let thread = EgoThreadModelFixtures.thread(
            messages: [EgoThreadModelFixtures.message(id: "assistant-1", parts: [.text("kept")])])
        let repository = ControlledEgoRepository(
            reads: [.success(thread), .failure(.unavailable)])
        let model = EgoThreadModelFixtures.model(
            repository: repository, conversationId: "conversation-1")

        await model.load()
        let transcript = model.messages
        await model.reload()

        #expect(model.messages == transcript)
        #expect(model.loadFailure == .unavailable)
    }
}
