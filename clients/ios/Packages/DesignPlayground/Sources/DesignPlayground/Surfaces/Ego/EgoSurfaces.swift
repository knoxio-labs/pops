import AppCore
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
                flow(
                    repository: EgoSurfaceFixtureRepository.make(with: "text"),
                    conversationId: "text"
                )
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
                flow(
                    repository: EgoSurfaceFixtureRepository.make(with: "cards"),
                    conversationId: "cards"
                )
            },
            DesignState("pending", "Pending batch") {
                flow(
                    repository: EgoSurfaceFixtureRepository.make(with: "pending"),
                    conversationId: "pending"
                )
            },
            DesignState("executed", "Executed batch") {
                flow(
                    repository: EgoSurfaceFixtureRepository.make(with: "executed"),
                    conversationId: "executed"
                )
            },
            DesignState("rejected", "Rejected batch") {
                flow(
                    repository: EgoSurfaceFixtureRepository.make(with: "rejected"),
                    conversationId: "rejected"
                )
            },
            DesignState("failed-write", "Batch with failed write") {
                flow(
                    repository: EgoSurfaceFixtureRepository.make(with: "failed-write"),
                    conversationId: "failed-write"
                )
            },
            DesignState("decision-failure", "Decision that can be retried") {
                flow(
                    repository: EgoSurfaceFixtureRepository.make(
                        with: "decision-failure", decisionFails: true),
                    conversationId: "decision-failure"
                )
            },
            DesignState("resumed-stream", "Resumed turn streaming") {
                flow(
                    repository: EgoSurfaceFixtureRepository.make(
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
                    repository: EgoSurfaceFixtureRepository.make(with: "decided-waiting"),
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
                    repository: EgoSurfaceFixtureRepository.make(
                        with: "load-failure", readFails: true),
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
        EgoConversationListSurface(repository: repository)
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
