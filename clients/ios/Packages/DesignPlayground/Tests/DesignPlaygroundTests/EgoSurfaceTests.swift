import AppCore
import Testing

@testable import DesignPlayground

@Suite("Ego playground surfaces")
@MainActor
internal struct EgoSurfaceTests {
    @Test("both surfaces are registered with their required state ids")
    func surfacesAreRegistered() throws {
        let thread = try #require(
            Catalog.surfaces.first { $0.id == SurfaceID(area: "ego", slug: "thread") })
        let conversations = try #require(
            Catalog.surfaces.first { $0.id == SurfaceID(area: "ego", slug: "conversations") })

        #expect(
            thread.states.map(\.id) == [
                "empty", "text-only", "streaming-tools", "cards", "pending", "executed",
                "rejected", "failed-write", "decision-failure", "resumed-stream",
                "decided-waiting", "stream-error", "load-failure",
            ])
        #expect(conversations.states.map(\.id) == ["populated", "empty", "failed"])
        #expect(thread.chrome == .sheet)
        #expect(conversations.chrome == .sheet)
        #expect(thread.backdrop.map { _ in true } == true)
        #expect(conversations.backdrop.map { _ in true } == true)
    }

    @Test("fixture messages cover text, entity and action parts with each card kind")
    func fixturesCoverMessagePartsAndCards() {
        #expect(
            EgoFixtures.textMessage.parts == [
                .text("A quiet walk by the harbour, then dinner somewhere nearby.")
            ])
        #expect(EgoFixtures.entityMessage.parts == [.entity(EgoFixtures.cards[0])])
        #expect(EgoFixtures.actionsMessage.parts == [.actions(EgoFixtures.actions)])
        #expect(
            EgoFixtures.cards.map(\.uri) == [
                "pops:finance/transaction/sample-transaction",
                "pops:finance/account/sample-account",
                "pops:purchases/purchase/sample-purchase",
                "pops:inventory/item/sample-item",
                "pops:registry/example/sample-record",
            ])
        #expect(EgoFixtures.actions.actions.map(\.status) == [.pending, .pending, .pending])
    }

    @Test("configured conversations and transcripts are returned as literals")
    func returnsConfiguredConversationsAndThreads() async throws {
        let conversation = EgoFixtures.conversations[0]
        let thread = EgoFixtures.thread(
            id: conversation.id, title: "Weekend", assistantParts: [.text("Done")])
        let repository = PlaygroundEgoRepository(
            conversations: .success([conversation]),
            threads: [conversation.id: .thread(thread)]
        )

        #expect(
            try await repository.conversations(limit: 10, offset: 0, query: nil) == [conversation])
        #expect(try await repository.conversation(id: conversation.id) == thread)
        #expect(try await repository.conversation(id: "missing") == nil)
    }

    @Test("a stalled chat stream remains open until its consumer is cancelled")
    func chatStallsUntilCancelled() async throws {
        let repository = PlaygroundEgoRepository(chat: .stalls)
        let finished = EgoRepositoryStreamFinished()
        let consumer = Task {
            do {
                for try await _ in repository.streamChat(
                    message: "sample", conversationId: nil, context: nil
                ) {}
            } catch {}
            await finished.mark()
        }

        try await Task.sleep(for: .milliseconds(20))
        #expect(!(await finished.value))
        consumer.cancel()
        await consumer.value
        #expect(await finished.value)
    }

    @Test("a failed batch decision surfaces the configured repository error")
    func decisionCanFail() async {
        let repository = PlaygroundEgoRepository(decision: .fails(.unavailable))

        await #expect(throws: RepositoryError.unavailable) {
            try await repository.decideBatch(
                id: "sample-batch",
                decision: EgoBatchDecision(approve: ["action-1"], reject: [], alwaysAllow: [])
            )
        }
    }

    @Test("resume streams yield the fixed events in order")
    func resumeYieldsConfiguredEventsInOrder() async throws {
        let events: [EgoStreamEvent] = [
            .tool(name: "finance.tag", status: .started),
            .token("The saved action ran."),
            .done(conversationId: "sample", messageId: "reply", parts: [.text("Complete")]),
        ]
        let repository = PlaygroundEgoRepository(resume: .events(events))
        var received: [EgoStreamEvent] = []

        for try await event in repository.resumeChat(conversationId: "sample", batchId: "batch") {
            received.append(event)
        }

        #expect(received == events)
    }
}

private actor EgoRepositoryStreamFinished {
    private(set) var value = false

    func mark() {
        value = true
    }
}
