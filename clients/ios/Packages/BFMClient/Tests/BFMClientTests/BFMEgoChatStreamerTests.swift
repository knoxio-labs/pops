import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite
internal struct BFMEgoChatStreamerTests {
    @Test
    func emitsTokenPartAndDoneInOrderAndSkipsHeartbeatComments() async throws {
        let body = [
            #"data: {"type":"token","text":"hello"}"# + "\r\n\r\n",
            ": keepalive\n\n",
            #"data: {"type":"part","part":{"type":"text","text":"answer"}}"# + "\n\n",
            #"data: {"type":"done","conversationId":"c1","messageId":"m1","parts":[]}"# + "\n\n",
        ].joined()
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: body)

        let events = try await BFMEgoChatStreamerTestSupport.collect(
            setup.streamer.stream(message: "hello", conversationId: nil, context: nil))

        #expect(
            events == [
                .token("hello"),
                .part(.text("answer")),
                .done(conversationId: "c1", messageId: "m1", parts: []),
            ])
    }

    @Test
    func skipsUnknownFrameBetweenTokensAndStopsAtDone() async throws {
        let body = [
            BFMEgoChatStreamerTestSupport.frame(#"{"type":"token","text":"first"}"#),
            BFMEgoChatStreamerTestSupport.frame(#"{"type":"future","value":1}"#),
            BFMEgoChatStreamerTestSupport.frame(#"{"type":"token","text":"second"}"#),
            BFMEgoChatStreamerTestSupport.frame(
                #"{"type":"done","conversationId":"c1","messageId":"m1","parts":[]}"#),
            BFMEgoChatStreamerTestSupport.frame(#"{"type":"token"}"#),
        ].joined()
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: body)

        let events = try await BFMEgoChatStreamerTestSupport.collect(
            setup.streamer.stream(message: "hello", conversationId: nil, context: nil))

        #expect(
            events == [
                .token("first"),
                .token("second"),
                .done(conversationId: "c1", messageId: "m1", parts: []),
            ])
    }

    @Test
    func failedFrameIsTerminal() async throws {
        let body =
            BFMEgoChatStreamerTestSupport.frame(
                #"{"type":"error","message":"try again","retryable":true}"#)
            + BFMEgoChatStreamerTestSupport.frame(#"{"type":"token"}"#)
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: body)

        let events = try await BFMEgoChatStreamerTestSupport.collect(
            setup.streamer.stream(message: "hello", conversationId: nil, context: nil))

        #expect(events == [.failed(message: "try again", retryable: true)])
    }

    @Test
    func chatBodyOmitsNullFieldsAndRetainsContextURI() async throws {
        let body = BFMEgoChatStreamerTestSupport.frame(
            #"{"type":"done","conversationId":"c1","messageId":"m1","parts":[]}"#)
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: body)
        let context = EgoAppContext(
            app: "inventory", uri: "pops://inventory/items/42", route: nil, entityTitle: nil)

        _ = try await BFMEgoChatStreamerTestSupport.collect(
            setup.streamer.stream(message: "hello", conversationId: nil, context: context))

        let request = try #require(await setup.source.recordedRequests().first)
        let requestBody = try #require(request.body)
        let jsonObject = try JSONSerialization.jsonObject(with: requestBody)
        let json = try #require(jsonObject as? [String: Any])
        let appContext = try #require(json["appContext"] as? [String: Any])
        #expect(json["message"] as? String == "hello")
        #expect(json["conversationId"] == nil)
        #expect(appContext["uri"] as? String == "pops://inventory/items/42")
        #expect(appContext["route"] == nil)
        #expect(appContext["entityTitle"] == nil)
    }

    @Test(arguments: [401, 403])
    func authStatusesAreUnauthorized(statusCode: Int) async throws {
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: statusCode, body: "{}")

        await #expect(throws: RepositoryError.unauthorized) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }

    @Test
    func upstreamUnavailable503CodeMapsToUnavailable() async throws {
        let body = #"{"code":"gateway.upstream_unavailable"}"#
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 503, body: body)

        await #expect(throws: RepositoryError.unavailable) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }

    @Test
    func invalid503BodyIsUnavailable() async throws {
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 503, body: "not json")

        await #expect(throws: RepositoryError.unavailable) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }

    @Test
    func upstreamContractMismatchFor502UsesRepositoryFailureMapping() async throws {
        let body = #"{"code":"gateway.upstream_contract_mismatch"}"#
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 502, body: body)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }

    @Test
    func rejected429IsRateLimited() async throws {
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 429, body: "")

        await #expect(throws: RepositoryError.transport("mobileEgo.chatStream: rate limited")) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }

    @Test
    func otherStatusesRetainTheStatusCode() async throws {
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 500, body: "server error")

        await #expect(throws: RepositoryError.transport("mobileEgo.chatStream: HTTP 500")) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }

    @Test
    func earlyEOFThrowsAfterDeliveringEarlierEvents() async throws {
        let body = BFMEgoChatStreamerTestSupport.frame(#"{"type":"token","text":"before eof"}"#)
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: body)
        var events: [EgoStreamEvent] = []

        await #expect(throws: RepositoryError.transport("mobileEgo.chatStream: stream ended early"))
        {
            for try await event in setup.streamer.stream(
                message: "hello", conversationId: nil, context: nil)
            {
                events.append(event)
            }
        }
        #expect(events == [.token("before eof")])
    }

    @Test
    func malformedKnownFrameIsAContractMismatch() async throws {
        let body = BFMEgoChatStreamerTestSupport.frame(#"{"type":"token"}"#)
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: body)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }

    @Test
    func transportRefreshFailurePropagatesUnchanged() async throws {
        let source = ScriptedBFMByteSource(replies: [.init(statusCode: 401)])
        let authorizer = RecordingBFMStreamAuthorizer(
            accessToken: "access-1", refreshBehavior: .fails)
        let transport = BFMEgoByteTransport(
            baseURL: try #require(URL(string: "https://bfm.example")),
            authorizer: authorizer,
            source: source)
        let streamer = BFMEgoChatStreamer(transport: transport)

        await #expect(throws: StreamAuthorizerTestFailure.refreshFailed) {
            try await BFMEgoChatStreamerTestSupport.collect(
                streamer.stream(message: "hello", conversationId: nil, context: nil))
        }
    }
}
