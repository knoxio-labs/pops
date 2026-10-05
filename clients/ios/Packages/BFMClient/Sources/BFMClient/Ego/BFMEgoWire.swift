import AppCore
import Foundation

internal struct BFMEgoFlatAction: Decodable {
    internal let actionId: String
    internal let tool: String
    internal let summary: String
    internal let status: String
}

internal struct BFMEgoFlatPart: Decodable {
    internal let type: String
    internal let text: String?
    internal let uri: String?
    internal let title: String?
    internal let subtitle: String?
    internal let batchId: String?
    internal let actions: [BFMEgoFlatAction]?

    internal var domainPart: EgoMessagePart? {
        switch type {
        case "text":
            guard let text else { return nil }
            return .text(text)
        case "entity":
            guard let uri, let title else { return nil }
            return .entity(EgoEntityPart(uri: uri, title: title, subtitle: subtitle))
        case "actions":
            guard let batchId, !batchId.isEmpty, let actions, !actions.isEmpty else { return nil }
            var domainActions: [EgoBatchAction] = []
            for action in actions {
                guard let status = EgoActionStatus(rawValue: action.status) else { return nil }
                domainActions.append(
                    EgoBatchAction(
                        actionId: action.actionId,
                        tool: action.tool,
                        summary: action.summary,
                        status: status))
            }
            return .actions(EgoActionsPart(batchId: batchId, actions: domainActions))
        default:
            return nil
        }
    }

    private enum CodingKeys: String, CodingKey {
        case type
        case text
        case uri
        case title
        case subtitle
        case batchId
        case actions
    }

    internal init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(String.self, forKey: .type)
        switch type {
        case "text":
            text = try container.decodeIfPresent(String.self, forKey: .text)
            uri = nil
            title = nil
            subtitle = nil
            batchId = nil
            actions = nil
        case "entity":
            text = nil
            uri = try container.decodeIfPresent(String.self, forKey: .uri)
            title = try container.decodeIfPresent(String.self, forKey: .title)
            subtitle = try container.decodeIfPresent(String.self, forKey: .subtitle)
            batchId = nil
            actions = nil
        case "actions":
            text = nil
            uri = nil
            title = nil
            subtitle = nil
            batchId = try container.decodeIfPresent(String.self, forKey: .batchId)
            actions = try container.decodeIfPresent([BFMEgoFlatAction].self, forKey: .actions)
        default:
            text = nil
            uri = nil
            title = nil
            subtitle = nil
            batchId = nil
            actions = nil
        }
    }
}

internal enum BFMEgoWire {
    private static let knownPartTypes: Set<String> = ["text", "entity", "actions"]

    internal static func parts(_ flat: [BFMEgoFlatPart]) -> [EgoMessagePart] {
        flat.compactMap(\.domainPart)
    }

    internal static func event(fromFramePayload payload: String) throws -> EgoStreamEvent? {
        let data = Data(payload.utf8)
        let header = try decode(BFMEgoFrameHeader.self, from: data)
        switch header.type {
        case "token":
            return .token(try decode(BFMEgoTokenFrame.self, from: data).text)
        case "tool":
            let frame = try decode(BFMEgoToolFrame.self, from: data)
            guard let status = EgoToolStatus(rawValue: frame.status) else {
                throw RepositoryError.contractMismatch
            }
            return .tool(name: frame.name, status: status)
        case "part":
            let frame = try decode(BFMEgoPartFrame.self, from: data)
            guard let part = frame.part.domainPart else {
                guard !knownPartTypes.contains(frame.part.type) else {
                    throw RepositoryError.contractMismatch
                }
                return nil
            }
            return .part(part)
        case "navigate":
            return .navigate(uri: try decode(BFMEgoNavigateFrame.self, from: data).uri)
        case "done":
            let frame = try decode(BFMEgoDoneFrame.self, from: data)
            return .done(
                conversationId: frame.conversationId,
                messageId: frame.messageId,
                parts: parts(frame.parts))
        case "error":
            let frame = try decode(BFMEgoErrorFrame.self, from: data)
            return .failed(message: frame.message, retryable: frame.retryable)
        default:
            return nil
        }
    }

    internal static func chatBody(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) throws -> Data {
        try encode(
            BFMEgoChatBody(
                message: message,
                conversationId: conversationId,
                appContext: context.map(BFMEgoAppContext.init)))
    }

    internal static func resumeBody(conversationId: String, batchId: String) throws -> Data {
        try encode(BFMEgoResumeBody(conversationId: conversationId, resumeBatchId: batchId))
    }

    private static func decode<Value: Decodable>(_ type: Value.Type, from data: Data) throws
        -> Value
    {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw RepositoryError.contractMismatch
        }
    }

    private static func encode<Value: Encodable>(_ value: Value) throws -> Data {
        do {
            return try JSONEncoder().encode(value)
        } catch {
            throw RepositoryError.contractMismatch
        }
    }
}

private struct BFMEgoFrameHeader: Decodable {
    let type: String
}

private struct BFMEgoTokenFrame: Decodable {
    let text: String
}

private struct BFMEgoToolFrame: Decodable {
    let name: String
    let status: String
}

private struct BFMEgoPartFrame: Decodable {
    let part: BFMEgoFlatPart
}

private struct BFMEgoNavigateFrame: Decodable {
    let uri: String
}

private struct BFMEgoDoneFrame: Decodable {
    let conversationId: String
    let messageId: String
    let parts: [BFMEgoFlatPart]
}

private struct BFMEgoErrorFrame: Decodable {
    let message: String
    let retryable: Bool
}

private struct BFMEgoChatBody: Encodable {
    let message: String
    let conversationId: String?
    let appContext: BFMEgoAppContext?
}

private struct BFMEgoAppContext: Encodable {
    let app: String
    let uri: String?
    let route: String?
    let entityTitle: String?

    fileprivate init(_ context: EgoAppContext) {
        app = context.app
        uri = context.uri
        route = context.route
        entityTitle = context.entityTitle
    }
}

private struct BFMEgoResumeBody: Encodable {
    let conversationId: String
    let resumeBatchId: String
}
