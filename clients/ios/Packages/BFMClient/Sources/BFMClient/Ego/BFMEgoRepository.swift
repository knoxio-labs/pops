import AppCore
import Foundation
import OpenAPIRuntime

/// Ego conversations and decisions over the authenticated BFM surface.
public struct BFMEgoRepository: EgoRepository {
    fileprivate typealias ListOperation = Operations.MobileEgo_listConversations
    fileprivate typealias ConversationOperation = Operations.MobileEgo_getConversation
    fileprivate typealias DecisionOperation = Operations.MobileEgo_decideActionBatch

    private let client: BFMHTTPClient
    private let streamer: BFMEgoChatStreamer

    /// Creates an Ego repository over the generated HTTP client and stream transport.
    public init(
        client: BFMHTTPClient,
        baseURL: URL,
        authorizer: any BFMStreamAuthorizer
    ) {
        self.init(
            client: client,
            streamer: BFMEgoChatStreamer(
                transport: BFMEgoByteTransport(baseURL: baseURL, authorizer: authorizer))
        )
    }

    internal init(client: BFMHTTPClient, streamer: BFMEgoChatStreamer) {
        self.client = client
        self.streamer = streamer
    }

    public func streamChat(
        message: String,
        conversationId: String?,
        context: EgoAppContext?
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        streamer.stream(message: message, conversationId: conversationId, context: context)
    }

    public func conversations(
        limit: Int,
        offset: Int,
        query: String?
    ) async throws -> [EgoConversation] {
        let output: ListOperation.Output
        do {
            output = try await client.generated.mobileEgo_listConversations(
                query: .init(limit: limit, offset: offset, q: query))
        } catch let error as ClientError {
            throw Self.clientFailure(
                error,
                operation: ListOperation.id,
                documentedStatuses: [400, 401, 403, 429, 502, 503])
        }

        switch output {
        case .ok(let ok):
            return try ok.body.json.conversations.map(Self.conversation(from:))
        case .badRequest: throw Self.invalidRequest(ListOperation.id)
        case .unauthorized, .forbidden: throw RepositoryError.unauthorized
        case .tooManyRequests: throw Self.rateLimited(ListOperation.id)
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: ListOperation.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: ListOperation.id)
        case .undocumented(let statusCode, _):
            throw Self.undocumented(ListOperation.id, statusCode: statusCode)
        }
    }

    public func conversation(id: String) async throws -> EgoThread? {
        let output: ConversationOperation.Output
        do {
            output = try await client.generated.mobileEgo_getConversation(
                path: .init(id: id))
        } catch let error as ClientError {
            if BFMRepositoryFailure.statusCode(in: error) == 404 { return nil }
            throw Self.clientFailure(
                error,
                operation: ConversationOperation.id,
                documentedStatuses: [400, 401, 403, 404, 429, 502, 503])
        }

        switch output {
        case .ok(let ok):
            return try Self.thread(from: ok.body.json)
        case .badRequest: throw Self.invalidRequest(ConversationOperation.id)
        case .unauthorized, .forbidden: throw RepositoryError.unauthorized
        case .notFound:
            return nil
        case .tooManyRequests: throw Self.rateLimited(ConversationOperation.id)
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: ConversationOperation.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: ConversationOperation.id)
        case .undocumented(let statusCode, _):
            throw Self.undocumented(ConversationOperation.id, statusCode: statusCode)
        }
    }

    public func decideBatch(id: String, decision: EgoBatchDecision) async throws {
        let output: DecisionOperation.Output
        do {
            output = try await client.generated.mobileEgo_decideActionBatch(
                path: .init(batchId: id),
                body: .json(
                    .init(
                        alwaysAllow: decision.alwaysAllow,
                        approve: decision.approve,
                        reject: decision.reject)))
        } catch let error as ClientError {
            if BFMRepositoryFailure.statusCode(in: error) == 404 {
                throw RepositoryError.conflict("not_found")
            }
            throw Self.clientFailure(
                error,
                operation: DecisionOperation.id,
                documentedStatuses: [400, 401, 403, 404, 409, 429, 502, 503])
        }

        switch output {
        case .ok:
            return
        case .badRequest: throw Self.invalidRequest(DecisionOperation.id)
        case .unauthorized, .forbidden: throw RepositoryError.unauthorized
        case .notFound:
            throw RepositoryError.conflict("not_found")
        case .conflict(let conflict):
            throw RepositoryError.conflict(try conflict.body.json.code)
        case .tooManyRequests: throw Self.rateLimited(DecisionOperation.id)
        case .badGateway(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: DecisionOperation.id)
        case .serviceUnavailable(let upstream):
            throw BFMRepositoryFailure.upstreamFailure(
                try upstream.body.json.code, operation: DecisionOperation.id)
        case .undocumented(let statusCode, _):
            throw Self.undocumented(DecisionOperation.id, statusCode: statusCode)
        }
    }

    public func resumeChat(
        conversationId: String,
        batchId: String
    ) -> AsyncThrowingStream<EgoStreamEvent, any Error> {
        streamer.resume(conversationId: conversationId, batchId: batchId)
    }
}

extension BFMEgoRepository {
    fileprivate static func clientFailure(
        _ error: ClientError,
        operation: String,
        documentedStatuses: Set<Int>
    ) -> RepositoryError {
        guard let statusCode = BFMRepositoryFailure.statusCode(in: error) else {
            return BFMRepositoryFailure.failure(error, operation: operation)
        }
        switch statusCode {
        case 401, 403:
            return .unauthorized
        case 429:
            return rateLimited(operation)
        case 502, 503:
            guard let code = BFMRepositoryFailure.code(in: error), !code.hasPrefix("ios.http.")
            else {
                return .unavailable
            }
            return BFMRepositoryFailure.upstreamFailure(code, operation: operation)
        default:
            guard documentedStatuses.contains(statusCode) else {
                return undocumented(operation, statusCode: statusCode)
            }
            return BFMRepositoryFailure.failure(error, operation: operation)
        }
    }

    fileprivate static func conversation(
        from payload: ListOperation.Output.Ok.Body.JsonPayload.ConversationsPayloadPayload
    ) throws -> EgoConversation {
        try conversation(
            id: payload.id,
            title: payload.title,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt)
    }

    fileprivate static func conversation(
        from payload: ConversationOperation.Output.Ok.Body.JsonPayload.ConversationPayload
    ) throws -> EgoConversation {
        try conversation(
            id: payload.id,
            title: payload.title,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt)
    }

    fileprivate static func conversation(
        id: String,
        title: String?,
        createdAt: String,
        updatedAt: String
    ) throws -> EgoConversation {
        guard let createdAt = ISO8601Instant.parse(createdAt),
            let updatedAt = ISO8601Instant.parse(updatedAt)
        else { throw RepositoryError.contractMismatch }
        return EgoConversation(id: id, title: title, createdAt: createdAt, updatedAt: updatedAt)
    }

    fileprivate static func thread(
        from payload: ConversationOperation.Output.Ok.Body.JsonPayload
    ) throws -> EgoThread {
        let conversation = try Self.conversation(from: payload.conversation)
        let messages = try payload.messages.compactMap { message -> EgoMessage? in
            guard let role = EgoRole(rawValue: message.role) else { return nil }
            guard let createdAt = ISO8601Instant.parse(message.createdAt) else {
                throw RepositoryError.contractMismatch
            }
            return EgoMessage(
                id: message.id,
                role: role,
                parts: BFMEgoWire.parts(message.parts.map(BFMEgoFlatPart.init)),
                createdAt: createdAt)
        }
        return EgoThread(conversation: conversation, messages: messages)
    }

    fileprivate static func invalidRequest(_ operation: String) -> RepositoryError {
        .transport("\(operation): invalid request")
    }

    fileprivate static func rateLimited(_ operation: String) -> RepositoryError {
        .transport("\(operation): rate limited")
    }

    fileprivate static func undocumented(_ operation: String, statusCode: Int) -> RepositoryError {
        .transport(
            BFMClientError.undocumentedResponse(
                operation: operation, statusCode: statusCode
            ).description)
    }
}

private typealias GeneratedEgoPart =
    Operations.MobileEgo_getConversation.Output.Ok.Body.JsonPayload.MessagesPayloadPayload
    .PartsPayloadPayload
private typealias GeneratedEgoAction = GeneratedEgoPart.ActionsPayloadPayload

extension BFMEgoFlatPart {
    fileprivate init(_ payload: GeneratedEgoPart) {
        type = payload._type
        text = payload.text
        uri = payload.uri
        title = payload.title
        subtitle = payload.subtitle
        batchId = payload.batchId
        actions = payload.actions?.map(BFMEgoFlatAction.init)
    }
}

extension BFMEgoFlatAction {
    fileprivate init(_ payload: GeneratedEgoAction) {
        actionId = payload.actionId
        tool = payload.tool
        summary = payload.summary
        status = payload.status
    }
}
