import AppCore
import FeatureEgo
import SwiftUI

@MainActor
internal enum EgoSurfaceFixtureRepository {
    static func make(
        with id: String,
        readFails: Bool = false,
        decisionFails: Bool = false,
        resume: PlaygroundEgoStreamOutcome = .events([])
    ) -> PlaygroundEgoRepository {
        PlaygroundEgoRepository(
            threads: [id: thread(id: id, readFails: readFails)],
            chat: .failure(.unavailable),
            resume: resume,
            decision: decisionFails ? .fails(.unavailable) : .succeeds
        )
    }

    private static func thread(id: String, readFails: Bool) -> PlaygroundEgoThreadOutcome {
        guard !readFails else { return .failure(.unavailable) }
        return .thread(
            EgoFixtures.thread(
                id: id,
                title: "A sample conversation",
                assistantParts: parts(with: id)
            ))
    }

    private static func parts(with id: String) -> [EgoMessagePart] {
        return switch id {
        case "text": [.text("A quiet walk by the harbour, then dinner nearby.")]
        case "cards": cardParts
        case "pending", "decision-failure": pendingParts
        case "executed":
            resolvedParts(
                "batch-executed", "These approved actions finished.",
                [.executed, .executed, .executed])
        case "rejected":
            resolvedParts(
                "batch-rejected", "No changes were made.", [.rejected, .rejected, .rejected])
        case "failed-write":
            [
                .text("One action could not be completed."),
                .actions(
                    EgoFixtures.actionPart(
                        id: "batch-failed", statuses: [.executed, .failed, .executed])),
            ]
        case "resumed-stream", "decided-waiting":
            resolvedParts(
                "batch-\(id)", "The decision was saved. The approved actions are waiting to run.",
                [.confirmed, .rejected, .confirmed])
        default: [.text("A sample assistant answer.")]
        }
    }

    private static var cardParts: [EgoMessagePart] {
        [
            .text("Here are a few records that might help."),
            .entity(EgoFixtures.cards[0]), .entity(EgoFixtures.cards[1]),
            .entity(EgoFixtures.cards[2]), .entity(EgoFixtures.cards[3]),
            .entity(EgoFixtures.cards[4]),
        ]
    }

    private static var pendingParts: [EgoMessagePart] {
        [
            .text("I can make these changes. Review them before they run."),
            .actions(EgoFixtures.actions),
        ]
    }

    private static func resolvedParts(
        _ batchID: String,
        _ message: String,
        _ statuses: [EgoActionStatus]
    ) -> [EgoMessagePart] {
        [
            .text(message),
            .actions(
                EgoFixtures.actionPart(
                    id: batchID,
                    statuses: statuses
                )),
        ]
    }
}

/// Keeps the fixture-backed list model alive when the playground reapplies
/// review conditions such as Dynamic Type.
@MainActor
internal struct EgoConversationListSurface: View {
    @State private var model: EgoConversationListModel

    init(repository: PlaygroundEgoRepository) {
        _model = State(initialValue: EgoConversationListModel(repository: repository))
    }

    var body: some View {
        EgoConversationListView(model: model, onSelect: { _ in })
    }
}
