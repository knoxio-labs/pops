import AppCore

/// One stable row in the transcript, independent of its SwiftUI renderer.
internal enum EgoThreadRow: Hashable, Identifiable {
    case text(messageId: String, index: Int, role: EgoRole, text: String)
    case entity(messageId: String, index: Int, part: EgoEntityPart)
    case actions(messageId: String, index: Int, part: EgoActionsPart)
    case tool(EgoToolActivity)
    case streaming(text: String)
    case failure(message: String, retryable: Bool)
    case notice(index: Int, message: String)

    internal var id: String {
        switch self {
        case .text(let messageId, let index, _, _):
            "message:\(messageId):text:\(index)"
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
        case .notice(let index, _):
            "notice:\(index)"
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
        rows.append(
            contentsOf: notices.enumerated().map {
                .notice(index: $0.offset, message: $0.element)
            })
        return rows
    }

    private static func messageRows(_ message: EgoMessage) -> [EgoThreadRow] {
        var rows: [EgoThreadRow] = []
        var textParts: [String] = []
        var textStartIndex: Int?

        func flushText() {
            guard !textParts.isEmpty, let startIndex = textStartIndex else { return }
            rows.append(
                .text(
                    messageId: message.id,
                    index: startIndex,
                    role: message.role,
                    text: textParts.joined()))
            textParts.removeAll(keepingCapacity: true)
            textStartIndex = nil
        }

        for (index, part) in message.parts.enumerated() {
            switch part {
            case .text(let text):
                if textStartIndex == nil { textStartIndex = index }
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
            rows.append(
                .text(
                    messageId: "failed-turn",
                    index: 0,
                    role: .assistant,
                    text: turn.streamedText))
        }
        rows.append(.failure(message: message, retryable: retryable))
        return rows
    }
}
