import AppCore
import Foundation

/// Fictional records used by the Ego surfaces. The strings intentionally
/// contain no account numbers, credentials or real personal data.
internal enum EgoFixtures {
    private static let createdAt = Date(timeIntervalSince1970: 1_780_000_000)
    private static let updatedAt = Date(timeIntervalSince1970: 1_780_003_600)

    internal static let conversations = [
        conversation("text", title: "Planning the weekend"),
        conversation("cards", title: "A few records"),
        conversation("pending", title: "Review suggested actions"),
    ]

    internal static let cards: [EgoEntityPart] = [
        EgoEntityPart(
            uri: "pops:finance/transaction/sample-transaction",
            title: "Corner cafe",
            subtitle: "Coffee · yesterday"
        ),
        EgoEntityPart(
            uri: "pops:finance/account/sample-account",
            title: "Everyday account",
            subtitle: "Daily spending"
        ),
        EgoEntityPart(
            uri: "pops:purchases/purchase/sample-purchase",
            title: "Garden supply order",
            subtitle: "Receipt captured"
        ),
        EgoEntityPart(
            uri: "pops:inventory/item/sample-item",
            title: "Camping lantern",
            subtitle: "Garage shelf"
        ),
        EgoEntityPart(
            uri: "pops:registry/example/sample-record",
            title: "A related note",
            subtitle: "Another POPS record"
        ),
    ]

    internal static let actions = actionPart(
        id: "batch-pending", statuses: [.pending, .pending, .pending])

    internal static let textMessage = message(
        id: "message-text",
        role: .assistant,
        parts: [.text("A quiet walk by the harbour, then dinner somewhere nearby.")]
    )
    internal static let entityMessage = message(
        id: "message-entity",
        role: .assistant,
        parts: [.entity(cards[0])]
    )
    internal static let actionsMessage = message(
        id: "message-actions",
        role: .assistant,
        parts: [.actions(actions)]
    )

    internal static func conversation(_ id: String, title: String?) -> EgoConversation {
        EgoConversation(id: id, title: title, createdAt: createdAt, updatedAt: updatedAt)
    }

    internal static func thread(
        id: String,
        title: String,
        userText: String = "Can you help me with this?",
        assistantParts: [EgoMessagePart]
    ) -> EgoThread {
        EgoThread(
            conversation: conversation(id, title: title),
            messages: [
                message(id: "\(id)-user", role: .user, parts: [.text(userText)]),
                message(id: "\(id)-assistant", role: .assistant, parts: assistantParts),
            ]
        )
    }

    internal static func actionPart(
        id: String,
        statuses: [EgoActionStatus]
    ) -> EgoActionsPart {
        let summaries = [
            ("finance.tag", "Tag the cafe transaction"),
            ("purchases.link", "Link the order to its receipt"),
            ("inventory.note", "Add a care reminder"),
        ]
        let rows = statuses.enumerated().map { index, status in
            let sample = summaries[index % summaries.count]
            return EgoBatchAction(
                actionId: "\(id)-action-\(index + 1)",
                tool: sample.0,
                summary: sample.1,
                status: status
            )
        }
        return EgoActionsPart(batchId: id, actions: rows)
    }

    internal static func message(
        id: String,
        role: EgoRole = .assistant,
        parts: [EgoMessagePart]
    ) -> EgoMessage {
        EgoMessage(id: id, role: role, parts: parts, createdAt: updatedAt)
    }
}
