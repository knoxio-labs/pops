import AppCore
import Foundation
import Testing

@testable import BFMClient

@Suite
internal struct BFMEgoChatStreamerResumeTests {
    @Test
    func encodesResumeBodyAndUsesTheSameEventParser() async throws {
        let body =
            BFMEgoChatStreamerTestSupport.frame(#"{"type":"token","text":"resumed"}"#)
            + BFMEgoChatStreamerTestSupport.frame(
                #"{"type":"done","conversationId":"c2","messageId":"m2","parts":[]}"#)
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 200, body: body)

        let events = try await BFMEgoChatStreamerTestSupport.collect(
            setup.streamer.resume(conversationId: "c2", batchId: "b2"))

        #expect(
            events == [
                .token("resumed"),
                .done(conversationId: "c2", messageId: "m2", parts: []),
            ])
        let request = try #require(await setup.source.recordedRequests().first)
        let requestBody = try #require(request.body)
        let jsonObject = try JSONSerialization.jsonObject(with: requestBody)
        let json = try #require(jsonObject as? [String: Any])
        #expect(Set(json.keys) == Set(["conversationId", "resumeBatchId"]))
        #expect(json["conversationId"] as? String == "c2")
        #expect(json["resumeBatchId"] as? String == "b2")
    }

    @Test
    func mapsResume503FailureCode() async throws {
        let body = #"{"code":"gateway.upstream_contract_mismatch"}"#
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 503, body: body)

        await #expect(throws: RepositoryError.contractMismatch) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.resume(conversationId: "c2", batchId: "b2"))
        }
    }

    @Test
    func resumeUnavailable503CodeMapsToUnavailable() async throws {
        let body = #"{"code":"gateway.upstream_unavailable"}"#
        let setup = try BFMEgoChatStreamerTestSupport.setup(statusCode: 503, body: body)

        await #expect(throws: RepositoryError.unavailable) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.resume(conversationId: "c2", batchId: "b2"))
        }
    }

    @Test
    func malformedResumeEventUsesTheSameContractError() async throws {
        let setup = try BFMEgoChatStreamerTestSupport.setup(
            statusCode: 200,
            body: BFMEgoChatStreamerTestSupport.frame(#"{"type":"token"}"#))

        await #expect(throws: RepositoryError.contractMismatch) {
            try await BFMEgoChatStreamerTestSupport.collect(
                setup.streamer.resume(conversationId: "c2", batchId: "b2"))
        }
    }
}
