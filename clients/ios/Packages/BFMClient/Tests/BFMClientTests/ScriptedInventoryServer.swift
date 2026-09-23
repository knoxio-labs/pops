import Foundation
import HTTPTypes
import OpenAPIRuntime

@testable import BFMClient

/// One answer the scripted server gives a route.
internal struct ScriptedReply: Sendable {
    internal let status: HTTPResponse.Status
    internal let json: String

    internal static func ok(_ json: String) -> ScriptedReply {
        ScriptedReply(status: .ok, json: json)
    }
}

/// One mutation as it went over the wire, read back from the request body.
internal struct SentMutation: Sendable, Equatable {
    internal let mutationId: String
    internal let op: String
    internal let catalogueRevision: Int?
    /// `args` re-serialised with sorted keys, for exact comparisons.
    internal let args: String
}

/// A BFM answering `/mobile/inventory/*` from a script, so
/// `OnlineInventoryStore` and the drain run through ``BFMInventoryTransport``'s
/// real request encoding and response decoding rather than a fake transport.
///
/// Each route answers from its own queue; the last reply in a queue repeats.
/// A route with no reply scripted answers `503`, so a test that forgot one
/// fails loudly rather than hanging.
internal actor ScriptedInventoryServer {
    private var queues: [String: [ScriptedReply]] = [:]
    private var mutationHandler: (@Sendable ([SentMutation]) -> String)?
    /// Route keys in the order they were asked: `snapshot`, `changes`,
    /// `catalogue:<revision>`, `types`, `mutations`.
    internal private(set) var routes: [String] = []
    internal private(set) var mutations: [SentMutation] = []

    internal func enqueue(_ route: String, _ replies: ScriptedReply...) {
        queues[route, default: []].append(contentsOf: replies)
    }

    /// Replaces whatever the route had queued.
    internal func set(_ route: String, _ replies: ScriptedReply...) {
        queues[route] = replies
    }

    /// Answers every mutations batch from `handler`, given what was sent.
    internal func onMutations(_ handler: @escaping @Sendable ([SentMutation]) -> String) {
        mutationHandler = handler
    }

    internal nonisolated var transport: StubTransport {
        StubTransport { request, body in try await self.respond(to: request, body: body) }
    }

    internal func count(_ route: String) -> Int {
        routes.filter { $0 == route }.count
    }

    private func respond(to request: HTTPRequest, body: HTTPBody?) async throws
        -> (HTTPResponse, HTTPBody?)
    {
        let route = try Self.route(of: request)
        routes.append(route)
        if route == "mutations", let mutationHandler {
            let sent = try await Self.mutations(in: body)
            mutations.append(contentsOf: sent)
            return Self.response(.ok(mutationHandler(sent)))
        }
        if route == "mutations" { mutations.append(contentsOf: try await Self.mutations(in: body)) }
        guard var queue = queues[route], let reply = queue.first else {
            return Self.response(ScriptedReply(status: .serviceUnavailable, json: "{}"))
        }
        if queue.count > 1 {
            queue.removeFirst()
            queues[route] = queue
        }
        return Self.response(reply)
    }

    private static func response(_ reply: ScriptedReply) -> (HTTPResponse, HTTPBody?) {
        (
            HTTPResponse(status: reply.status, headerFields: [.contentType: "application/json"]),
            HTTPBody(reply.json)
        )
    }

    private static func route(of request: HTTPRequest) throws -> String {
        let components = try require(URLComponents(string: request.path ?? ""))
        switch components.path {
        case "/mobile/inventory/sync/snapshot": return "snapshot"
        case "/mobile/inventory/sync/changes": return "changes"
        case "/mobile/inventory/mutations": return "mutations"
        case "/mobile/inventory/types": return "types"
        case "/mobile/inventory/type-catalogue":
            let revision = components.queryItems?.first { $0.name == "revision" }?.value
            return "catalogue:\(revision ?? "?")"
        default: return components.path
        }
    }

    private static func mutations(in body: HTTPBody?) async throws -> [SentMutation] {
        let data = try await Data(collecting: try require(body), upTo: 1 << 20)
        let object = try require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let list = try require(object["mutations"] as? [[String: Any]])
        return try list.map { mutation in
            let args = try JSONSerialization.data(
                withJSONObject: mutation["args"] ?? [:], options: [.sortedKeys])
            return SentMutation(
                mutationId: try require(mutation["mutationId"] as? String),
                op: try require(mutation["op"] as? String),
                catalogueRevision: mutation["catalogueRevision"] as? Int,
                args: try require(String(bytes: args, encoding: .utf8)))
        }
    }
}

/// Unwraps a value the stub needs from a request, throwing rather than
/// recording an issue, so the request that was malformed fails.
private func require<T>(_ value: T?) throws -> T {
    guard let value else { throw ScriptedServerError.malformedRequest }
    return value
}

private enum ScriptedServerError: Error {
    case malformedRequest
}
