import AppCore
import DesignSystem
import FeatureEgo
import SwiftUI

@MainActor
internal enum EgoSurfaces {
    internal static let surfaces = [thread, conversations]

    private static let thread = DesignSurface(
        id: SurfaceID(area: "ego", slug: "thread"),
        title: "Ego thread",
        synopsis: "The real chat flow over a fixed local repository.",
        chrome: .sheet,
        states: [
            DesignState("empty", "Empty thread") {
                flow(repository: PlaygroundEgoRepository())
            },
            DesignState("text-only", "Text-only answer") {
                flow(repository: repository(with: "text"), conversationId: "text")
            },
            DesignState("streaming-tools", "Streaming with tool lines") {
                flow(
                    repository: PlaygroundEgoRepository(
                        chat: .eventsThenStall([
                            .tool(name: "finance.search", status: .started),
                            .tool(name: "finance.search", status: .finished),
                            .token("I found a couple of useful records."),
                        ])
                    ),
                    prompt: "Find a couple of useful records"
                )
            },
            DesignState("cards", "Answer with cards") {
                flow(repository: repository(with: "cards"), conversationId: "cards")
            },
            DesignState("pending", "Pending batch") {
                flow(repository: repository(with: "pending"), conversationId: "pending")
            },
            DesignState("executed", "Executed batch") {
                flow(repository: repository(with: "executed"), conversationId: "executed")
            },
            DesignState("rejected", "Rejected batch") {
                flow(repository: repository(with: "rejected"), conversationId: "rejected")
            },
            DesignState("failed-write", "Batch with failed write") {
                flow(repository: repository(with: "failed-write"), conversationId: "failed-write")
            },
            DesignState("decision-failure", "Decision that can be retried") {
                flow(
                    repository: repository(with: "decision-failure", decisionFails: true),
                    conversationId: "decision-failure"
                )
            },
            DesignState("resumed-stream", "Resumed turn streaming") {
                flow(
                    repository: repository(
                        with: "resumed-stream",
                        resume: .eventsThenStall([
                            .tool(name: "finance.tag", status: .started),
                            .tool(name: "finance.tag", status: .finished),
                            .token("The approved change is complete. I’m checking the next step."),
                        ])
                    ),
                    conversationId: "resumed-stream",
                    continueBatchId: "batch-resumed-stream"
                )
            },
            DesignState("decided-waiting", "Decided batch waiting to continue") {
                flow(
                    repository: repository(with: "decided-waiting"),
                    conversationId: "decided-waiting"
                )
            },
            DesignState("stream-error", "Stream error with retry") {
                flow(
                    repository: PlaygroundEgoRepository(chat: .failure(.unavailable)),
                    prompt: "Try this again"
                )
            },
            DesignState("load-failure", "Conversation that failed to load") {
                flow(
                    repository: repository(with: "load-failure", readFails: true),
                    conversationId: "load-failure"
                )
            },
        ],
        backdrop: { EgoEntryShellView() }
    )

    private static let conversations = DesignSurface(
        id: SurfaceID(area: "ego", slug: "conversations"),
        title: "Ego conversations",
        synopsis: "The searchable history for a few fictional conversations.",
        chrome: .sheet,
        states: [
            DesignState("populated", "Populated") {
                conversationList(
                    repository: PlaygroundEgoRepository(
                        conversations: .success(EgoFixtures.conversations)
                    ))
            },
            DesignState("empty", "Empty") {
                conversationList(repository: PlaygroundEgoRepository())
            },
            DesignState("failed", "Failed") {
                conversationList(
                    repository: PlaygroundEgoRepository(
                        conversations: .failure(.unavailable)
                    ))
            },
        ],
        backdrop: { EgoEntryShellView() }
    )

    private static func flow(
        repository: PlaygroundEgoRepository,
        conversationId: String? = nil,
        prompt: String? = nil,
        continueBatchId: String? = nil
    ) -> some View {
        EgoFlowView(
            dependencies: dependencies(ego: repository),
            context: { nil },
            entityRouter: EntityRouterRegistry(),
            onClose: {},
            initialConversationId: conversationId,
            initialPrompt: prompt,
            continueBatchId: continueBatchId
        )
    }

    private static func conversationList(repository: PlaygroundEgoRepository) -> some View {
        EgoConversationListView(
            model: EgoConversationListModel(repository: repository),
            onSelect: { _ in }
        )
    }

    private static func repository(
        with id: String,
        readFails: Bool = false,
        decisionFails: Bool = false,
        resume: PlaygroundEgoStreamOutcome = .events([])
    ) -> PlaygroundEgoRepository {
        let actions: EgoActionsPart
        let parts: [EgoMessagePart]
        switch id {
        case "text":
            actions = EgoFixtures.actions
            parts = [.text("A quiet walk by the harbour, then dinner nearby.")]
        case "cards":
            actions = EgoFixtures.actions
            parts = [
                .text("Here are a few records that might help."),
                .entity(EgoFixtures.cards[0]), .entity(EgoFixtures.cards[1]),
                .entity(EgoFixtures.cards[2]), .entity(EgoFixtures.cards[3]),
                .entity(EgoFixtures.cards[4]),
            ]
        case "pending", "decision-failure":
            actions = EgoFixtures.actions
            parts = [
                .text("I can make these changes. Review them before they run."),
                .actions(actions),
            ]
        case "executed":
            actions = EgoFixtures.actionPart(
                id: "batch-executed", statuses: [.executed, .executed, .executed])
            parts = [.text("These approved actions finished."), .actions(actions)]
        case "rejected":
            actions = EgoFixtures.actionPart(
                id: "batch-rejected", statuses: [.rejected, .rejected, .rejected])
            parts = [.text("No changes were made."), .actions(actions)]
        case "failed-write":
            actions = EgoFixtures.actionPart(
                id: "batch-failed", statuses: [.executed, .failed, .executed])
            parts = [.text("One action could not be completed."), .actions(actions)]
        case "resumed-stream", "decided-waiting":
            actions = EgoFixtures.actionPart(
                id: "batch-\(id)", statuses: [.confirmed, .rejected, .confirmed])
            parts = [
                .text("The decision was saved. The approved actions are waiting to run."),
                .actions(actions),
            ]
        default:
            actions = EgoFixtures.actions
            parts = [.text("A sample assistant answer.")]
        }

        let thread: PlaygroundEgoThreadOutcome =
            readFails
            ? .failure(.unavailable)
            : .thread(
                EgoFixtures.thread(
                    id: id,
                    title: "A sample conversation",
                    assistantParts: parts
                ))
        return PlaygroundEgoRepository(
            threads: [id: thread],
            chat: .failure(.unavailable),
            resume: resume,
            decision: decisionFails ? .fails(.unavailable) : .succeeds
        )
    }

    private static func dependencies(ego: any EgoRepository) -> AppDependencies {
        let unbound = AppDependencies.unbound
        return AppDependencies(
            transactions: unbound.transactions,
            pairing: unbound.pairing,
            reachability: unbound.reachability,
            receiptCapture: unbound.receiptCapture,
            purchases: unbound.purchases,
            merchants: unbound.merchants,
            accounts: unbound.accounts,
            inventory: unbound.inventory,
            codeSuggestions: unbound.codeSuggestions,
            barcodeLookup: unbound.barcodeLookup,
            ego: ego
        )
    }
}
