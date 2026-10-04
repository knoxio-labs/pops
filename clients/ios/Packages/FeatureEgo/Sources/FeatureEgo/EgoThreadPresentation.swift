import AppCore

/// One stable row in the transcript, independent of its SwiftUI renderer.
internal enum EgoThreadRow: Hashable, Identifiable {
    case text(messageId: String, role: EgoRole, text: String)
    case entity(messageId: String, index: Int, part: EgoEntityPart)
    case actions(messageId: String, index: Int, part: EgoActionsPart)
    case tool(EgoToolActivity)
    case streaming(text: String)
    case failure(message: String, retryable: Bool)
    case notice(String)

    internal var id: String {
        switch self {
        case .text(let messageId, let role, let text):
            "message:\(messageId):text:\(role.rawValue):\(text)"
        case .entity(let messageId, let index, _):
            "message:\(messageId):entity:\(index)"
        case .actions(let messageId, let index, _):
            "message:\(messageId):actions:\(index)"
        case .tool(let activity):
            "tool:\(activity.id)"
        case .streaming:
            "streaming"
        case .failure:
            "failure"
        case .notice(let notice):
            "notice:\(notice)"
        }
    }

    /// Builds persisted message rows, then the live turn, then any screen notices.
    internal static func rows(
        messages: [EgoMessage],
        turn: EgoTurnState?,
        notices: [String]
    ) -> [EgoThreadRow] {
        var rows = messages.flatMap(messageRows)
        rows.append(contentsOf: turnRows(turn))
        rows.append(contentsOf: notices.map(EgoThreadRow.notice))
        return rows
    }

    private static func messageRows(_ message: EgoMessage) -> [EgoThreadRow] {
        var rows: [EgoThreadRow] = []
        var textParts: [String] = []

        func flushText() {
            guard !textParts.isEmpty else { return }
            rows.append(.text(messageId: message.id, role: message.role, text: textParts.joined()))
            textParts.removeAll(keepingCapacity: true)
        }

        for (index, part) in message.parts.enumerated() {
            switch part {
            case .text(let text):
                textParts.append(text)
            case .entity(let entity):
                flushText()
                rows.append(.entity(messageId: message.id, index: index, part: entity))
            case .actions(let actions):
                flushText()
                rows.append(.actions(messageId: message.id, index: index, part: actions))
            }
        }

        flushText()
        return rows
    }

    private static func turnRows(_ turn: EgoTurnState?) -> [EgoThreadRow] {
        guard let turn else { return [] }
        return switch turn.phase {
        case .streaming: streamingRows(turn)
        case .failed(let message, let retryable):
            failedRows(turn, message: message, retryable: retryable)
        case .finished: []
        }
    }

    private static func streamingRows(_ turn: EgoTurnState) -> [EgoThreadRow] {
        var rows = turn.tools.map(EgoThreadRow.tool)
        for (index, part) in turn.parts.enumerated() {
            switch part {
            case .text:
                break
            case .entity(let entity):
                rows.append(.entity(messageId: "streaming-turn", index: index, part: entity))
            case .actions(let actions):
                rows.append(.actions(messageId: "streaming-turn", index: index, part: actions))
            }
        }
        rows.append(.streaming(text: turn.streamedText))
        return rows
    }

    private static func failedRows(
        _ turn: EgoTurnState,
        message: String,
        retryable: Bool
    ) -> [EgoThreadRow] {
        var rows: [EgoThreadRow] = []
        if !turn.streamedText.isEmpty {
            rows.append(.text(messageId: "failed-turn", role: .assistant, text: turn.streamedText))
        }
        rows.append(.failure(message: message, retryable: retryable))
        return rows
    }
}
