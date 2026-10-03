import AppCore
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing

@testable import BFMClient

private actor DecisionRequestCapture {
    private var path: String?
    private var body: Data?

    func save(path: String?, body: Data) {
        self.path = path
        self.body = body
    }

    func value() -> (String?, Data?) {
        (path, body)
    }
}

@Suite("BFM Ego repository")
internal struct BFMEgoRepositoryTests {
    @Test("lists rows, including a null title, and sends the search query")
    func listConversations() async throws {
        let transport = StubTransport(status: .ok, json: EgoRepositoryFixtures.listJSON)
        let conversations = try await EgoRepositoryFixtures.repository(transport).conversations(
            limit: 20, offset: 40, query: "coffee")

        #expect(conversations.map(\.id) == ["c1", "c2"])
        #expect(conversations[0].title == "First")
        #expect(conversations[1].title == nil)
        #expect(conversations[0].createdAt == ISO8601Instant.parse("2026-10-03T10:00:00Z"))
        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.operationID == "mobileEgo.listConversations")
        #expect(
            EgoRepositoryFixtures.query(sent.request) == [
                "limit": "20", "offset": "40", "q": "coffee",
            ])
    }

    @Test("maps known parts and drops unknown part types, statuses, and roles")
    func mapsConversation() async throws {
        let transport = StubTransport(status: .ok, json: EgoRepositoryFixtures.threadJSON)
        let thread = try #require(
            try await EgoRepositoryFixtures.repository(transport).conversation(id: "c1"))

        #expect(thread.conversation.id == "c1")
        #expect(thread.messages.map(\.id) == ["m1"])
        let message = try #require(thread.messages.first)
        #expect(message.role == .assistant)
        #expect(
            message.parts == [
                .text("hello"),
                .entity(EgoEntityPart(uri: "pops:inventory/item/1", title: "Item", subtitle: nil)),
                .entity(
                    EgoEntityPart(
                        uri: "pops:finance/transaction/2", title: "Coffee", subtitle: "Cafe")),
                .actions(
                    EgoActionsPart(
                        batchId: "b1",
                        actions: [
                            EgoBatchAction(
                                actionId: "a1", tool: "finance.create", summary: "Create",
                                status: .pending),
                            EgoBatchAction(
                                actionId: "a2", tool: "inventory.update", summary: "Update",
                                status: .confirmed),
                        ])),
            ])
    }

    @Test("a missing conversation is an absence")
    func missingConversation() async throws {
        let json = EgoRepositoryFixtures.failureJSON(code: "not_found", status: 404)
        let repository = try EgoRepositoryFixtures.repository(
            StubTransport(status: .notFound, json: json))

        #expect(try await repository.conversation(id: "missing") == nil)
    }

    @Test("deciding sends the batch and all three lists, then ignores the success body")
    func decideBatch() async throws {
        let capture = DecisionRequestCapture()
        let transport = StubTransport { request, body in
            let bytes = try await Data(collecting: body ?? HTTPBody(), upTo: 1 << 16)
            await capture.save(path: request.path, body: bytes)
            return (
                HTTPResponse(status: .ok, headerFields: [.contentType: "application/json"]),
                HTTPBody(#"{"batchId":"response-value-is-ignored"}"#)
            )
        }
        let repository = try EgoRepositoryFixtures.repository(transport)

        try await repository.decideBatch(
            id: "batch-7",
            decision: EgoBatchDecision(
                approve: ["a1"], reject: ["a2"], alwaysAllow: ["a3"]))

        let (path, body) = await capture.value()
        #expect(path == "/mobile/ego/action-batches/batch-7/decide")
        let bytes = try #require(body)
        let object = try JSONSerialization.jsonObject(with: bytes)
        let payload = try #require(object as? [String: [String]])
        #expect(payload == ["approve": ["a1"], "reject": ["a2"], "alwaysAllow": ["a3"]])
    }

    @Test("decision conflicts distinguish stale batches from missing batches")
    func decisionConflicts() async throws {
        let decision = EgoBatchDecision(approve: ["a1"], reject: [], alwaysAllow: [])
        let conflict = try EgoRepositoryFixtures.repository(
            StubTransport(
                status: .conflict,
                json: EgoRepositoryFixtures.failureJSON(code: "batch_not_pending", status: 409)))
        await #expect(throws: RepositoryError.conflict("batch_not_pending")) {
            try await conflict.decideBatch(id: "b1", decision: decision)
        }

        let missing = try EgoRepositoryFixtures.repository(
            StubTransport(
                status: .notFound,
                json: EgoRepositoryFixtures.failureJSON(code: "not_found", status: 404)))
        await #expect(throws: RepositoryError.conflict("not_found")) {
            try await missing.decideBatch(id: "b1", decision: decision)
        }
    }

    @Test("decision authorization and upstream failures keep their repository meanings")
    func decisionAccessAndUpstreamFailures() async throws {
        let decision = EgoBatchDecision(approve: ["a1"], reject: [], alwaysAllow: [])
        let forbidden = try EgoRepositoryFixtures.repository(
            StubTransport(status: .forbidden, json: EgoRepositoryFixtures.forbiddenJSON))
        await #expect(throws: RepositoryError.unauthorized) {
            try await forbidden.decideBatch(id: "b1", decision: decision)
        }

        let unauthorized = try EgoRepositoryFixtures.repository(
            StubTransport(status: .unauthorized, json: EgoRepositoryFixtures.unauthorizedJSON))
        await #expect(throws: RepositoryError.unauthorized) {
            try await unauthorized.decideBatch(id: "b1", decision: decision)
        }

        let mismatch = try EgoRepositoryFixtures.repository(
            StubTransport(
                status: .badGateway,
                json: EgoRepositoryFixtures.failureJSON(
                    code: "gateway.upstream_contract_mismatch", status: 502)))
        await #expect(throws: RepositoryError.contractMismatch) {
            try await mismatch.decideBatch(id: "b1", decision: decision)
        }

        let unavailable = try EgoRepositoryFixtures.repository(
            StubTransport(
                status: .serviceUnavailable,
                json: EgoRepositoryFixtures.failureJSON(
                    code: "gateway.upstream_unavailable", status: 503)))
        await #expect(throws: RepositoryError.unavailable) {
            try await unavailable.decideBatch(id: "b1", decision: decision)
        }
    }

    @Test("rate limits and undocumented statuses name the operation")
    func listFailures() async throws {
        let limited = try EgoRepositoryFixtures.repository(
            StubTransport(
                status: .tooManyRequests,
                json: #"{"code":"rate_limited","message":"Later","retryAfterSeconds":30}"#))
        await #expect(
            throws: RepositoryError.transport("mobileEgo.listConversations: rate limited")
        ) {
            try await limited.conversations(limit: 1, offset: 0, query: nil)
        }

        let undocumented = try EgoRepositoryFixtures.repository(
            StubTransport(status: .internalServerError, json: "{}"))
        await #expect(
            throws: RepositoryError.transport(
                "mobileEgo.listConversations: undocumented status 500")
        ) {
            try await undocumented.conversations(limit: 1, offset: 0, query: nil)
        }
    }

    @Test("resume delegates to the streamer's event sequence")
    func resumeChat() async throws {
        let streamer = try BFMEgoChatStreamerTestSupport.setup(
            statusCode: 200,
            body: BFMEgoChatStreamerTestSupport.frame(
                #"{"type":"token","text":"continued"}"#)
                + BFMEgoChatStreamerTestSupport.frame(
                    #"{"type":"done","conversationId":"c1","messageId":"m2","parts":[]}"#))
        let repository = try EgoRepositoryFixtures.repository(
            StubTransport(status: .ok, json: #"{"conversations":[],"total":0}"#),
            streamer: streamer.streamer)

        let events = try await BFMEgoChatStreamerTestSupport.collect(
            repository.resumeChat(conversationId: "c1", batchId: "b1"))
        #expect(events.first == .token("continued"))
        #expect(events.count == 2)
    }
}

private enum EgoRepositoryFixtures {
    static let listJSON = """
        {"conversations":[
        {"id":"c1","title":"First","createdAt":"2026-10-03T10:00:00Z","updatedAt":"2026-10-03T10:05:00Z"},
        {"id":"c2","title":null,"createdAt":"2026-10-02T10:00:00Z","updatedAt":"2026-10-02T10:05:00Z"}
        ],"total":2}
        """

    static let threadJSON = """
        {"conversation":{"id":"c1","title":"Thread",
        "createdAt":"2026-10-03T10:00:00Z","updatedAt":"2026-10-03T10:05:00Z"},
        "messages":[
        {"id":"m1","role":"assistant","createdAt":"2026-10-03T10:01:00Z","parts":[
        {"type":"text","text":"hello"},
        {"type":"entity","uri":"pops:inventory/item/1","title":"Item"},
        {"type":"entity","uri":"pops:finance/transaction/2","title":"Coffee","subtitle":"Cafe"},
        {"type":"actions","batchId":"b1","actions":[
        {"actionId":"a1","tool":"finance.create","summary":"Create","status":"pending"},
        {"actionId":"a2","tool":"inventory.update","summary":"Update","status":"confirmed"}]},
        {"type":"actions","batchId":"b2","actions":[
        {"actionId":"a3","tool":"future.run","summary":"Future","status":"future"}]},
        {"type":"future"}
        ]},
        {"id":"m2","role":"system","createdAt":"2026-10-03T10:02:00Z","parts":[{"type":"text","text":"omit"}]}
        ]}
        """

    static let unauthorizedJSON =
        #"{"code":"bfm.auth.invalid_token","message":"Denied","requestId":"auth-1","retryable":false}"#
    static let forbiddenJSON =
        #"{"capability":"ego.actions","code":"capability_not_granted","message":"Denied"}"#

    static func failureJSON(code: String, status: Int) -> String {
        """
        {"code":"\(code)","details":{"upstream":{"pillar":"cerebrum",
        "status":\(status)}},"message":"Failed","requestId":"request-1","retryable":false}
        """
    }

    static func repository(
        _ transport: StubTransport,
        streamer: BFMEgoChatStreamer? = nil
    ) throws -> BFMEgoRepository {
        let url = try #require(URL(string: "https://bfm.example"))
        let selectedStreamer: BFMEgoChatStreamer
        if let streamer {
            selectedStreamer = streamer
        } else {
            selectedStreamer = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: "")
                .streamer
        }
        return BFMEgoRepository(
            client: BFMHTTPClient(baseURL: url, transport: transport),
            streamer: selectedStreamer)
    }

    static func query(_ request: HTTPRequest) -> [String: String] {
        let path = request.path ?? ""
        let components = URLComponents(string: "https://bfm.example\(path)")
        return Dictionary(
            uniqueKeysWithValues: (components?.queryItems ?? []).compactMap { item in
                item.value.map { (item.name, $0) }
            })
    }
}
